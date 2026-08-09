# OpenShare contact links

OpenChat web and desktop clients accept deliberate contact links from an OpenShare companion. The
link opens the Friends screen and prefills either an OpenChat username or 8-digit friend code. The
user still submits the request in OpenChat.

## Configure OpenShare

Set OpenShare's optional companion address to the public OpenChat web URL:

```dotenv
OPENCHAT_PUBLIC_URL=https://chat.example.com
```

This setting is independent from the server-to-server `SHARE_BASE_URL` and `SHARE_API_KEY` upload
contract. It is a browser destination, not a credential.

## Link behavior

OpenShare constructs one of these URLs from a contact card:

```text
https://chat.example.com/?friendCode=12345678
https://chat.example.com/?username=example-user
```

On authenticated startup, OpenChat:

1. recognizes and normalizes the contact parameter;
2. opens Home and the Friends screen instead of restoring the previous server or direct message;
3. prefills the matching add-friend input;
4. removes the contact parameter from browser history; and
5. waits for the user to press **Add** or **Send Request**.

If authentication is required, OpenChat keeps the complete return URL through the OIDC redirect so
the link can be processed after login.

## Privacy and security

The URL contains only the explicitly linked OpenChat username or friend code. OpenShare does not
send the contact's name, addresses, email addresses, phone numbers, birthday, notes, or groups.
OpenChat validates friend codes as exactly eight digits and uses its existing authenticated friend
request endpoint. A link cannot silently create a friendship.

The parameters are removed with `history.replaceState` after they are read. Other query parameters
and URL fragments, including Patreon callbacks and client state, are preserved.

## Verification

The web harness covers parameter validation, username normalization, and history cleanup. The
normal Friends UI and API continue to own request submission and error reporting.
