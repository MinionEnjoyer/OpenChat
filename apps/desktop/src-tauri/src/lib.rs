use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_updater::UpdaterExt;

// Pull ?token=… out of an openchat://auth?token=… deep link and hand it to the
// web layer, which stores it and reloads into the signed-in app.
fn handle_auth_url(app: &AppHandle, url: &str) {
    if let Some((_, rest)) = url.split_once("token=") {
        let token = rest.split('&').next().unwrap_or("");
        if !token.is_empty() {
            let _ = app.emit("auth-token", token.to_string());
        }
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// Open a URL (e.g. the SSO login) in the user's default browser.
#[tauri::command]
async fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

// Show an OS notification (mentions, DMs, incoming calls when the app is unfocused).
#[tauri::command]
fn notify(app: AppHandle, title: String, body: String) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

// Driven by the web "checking for updates" gate on launch. Returns false when the
// app is already current; when an update is found it downloads it (emitting progress
// events) and relaunches into the new version (so this never returns in that case).
#[tauri::command]
async fn run_update(app: AppHandle) -> Result<bool, String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await.map_err(|e| e.to_string())? {
        Some(update) => {
            let _ = app.emit("update://status", "downloading");
            let downloaded = AtomicU64::new(0);
            update
                .download_and_install(
                    |chunk_len, content_len| {
                        let d = downloaded.fetch_add(chunk_len as u64, Ordering::Relaxed) + chunk_len as u64;
                        let _ = app.emit("update://progress", serde_json::json!({ "downloaded": d, "total": content_len }));
                    },
                    || { let _ = app.emit("update://status", "installing"); },
                )
                .await
                .map_err(|e| e.to_string())?;
            app.restart();
        }
        None => Ok(false),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin: routes a second launch (incl. a deep link on
        // Windows/Linux) into the already-running instance.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(url) = argv.iter().find(|a| a.starts_with("openchat://")) {
                handle_auth_url(app, url);
            } else if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![open_external, notify, run_update])
        .setup(|app| {
            // Deep links that cold-started the app / arrive while running.
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    for u in urls {
                        handle_auth_url(app.handle(), u.as_str());
                    }
                }
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for u in event.urls() {
                        handle_auth_url(&handle, u.as_str());
                    }
                });
            }

            // System tray with Open / Quit.
            let open = MenuItem::with_id(app, "open", "Open OpenChat", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("OpenChat")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        // Close-to-tray: hide instead of quitting so notifications keep flowing.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running OpenChat");
}
