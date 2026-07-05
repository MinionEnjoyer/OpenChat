import type { User, Server } from './types';

interface ApiResponse<T> extends Response {
  json(): Promise<T>;
}

async function req<T>(path: string, method = 'GET', body?: any): Promise<T> {
  const options: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, options) as ApiResponse<T>;

  if (!res.ok) {
    // Prefer the server's message (Nest exceptions serialize { message } in the body).
    let message = res.statusText;
    try {
      const body = await res.clone().json();
      if (typeof body?.message === 'string') message = body.message;
      else if (Array.isArray(body?.message)) message = body.message.join(', ');
    } catch { /* non-JSON body — keep statusText */ }
    const err: any = new Error(message);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return res.json();
}

export async function listFriends(): Promise<User[]> {
  return req<User[]>('/friends');
}

export async function listFriendRequests(): Promise<{ incoming: { id: string; user: User }[]; outgoing: { id: string; user: User }[] }> {
  return req<{ incoming: { id: string; user: User }[]; outgoing: { id: string; user: User }[] }>('/friends/requests');
}

export async function sendFriendRequest(username: string): Promise<any> {
  return req<any>('/friends/requests', 'POST', { username });
}

export async function addFriendByCode(friendCode: string): Promise<any> {
  return req<any>('/friends/requests', 'POST', { friendCode });
}

export async function acceptFriendRequest(id: string): Promise<void> {
  await req<void>(`/friends/requests/${id}/accept`, 'POST');
}

export async function declineFriendRequest(id: string): Promise<void> {
  await req<void>(`/friends/requests/${id}/decline`, 'POST');
}

export async function removeFriend(userId: string): Promise<void> {
  await req<void>(`/friends/${userId}`, 'DELETE');
}

export async function blockUser(userId: string): Promise<void> {
  await req<void>(`/friends/block/${userId}`, 'POST');
}

export async function listDms(): Promise<{ id: string; type: string; recipients: User[]; lastMessageAt?: string | null }[]> {
  return req<{ id: string; type: string; recipients: User[]; lastMessageAt?: string | null }[]>('/dms');
}

export async function openDm(userId: string): Promise<{ id: string; type: string; recipients: User[] }> {
  return req<{ id: string; type: string; recipients: User[] }>('/dms', 'POST', { userId });
}

export async function createInvite(serverId: string): Promise<{ code: string }> {
  return req<{ code: string }>(`/servers/${serverId}/invites`, 'POST');
}

export async function getInvite(code: string): Promise<{ code: string; server: { id: string; name: string } }> {
  return req<{ code: string; server: { id: string; name: string } }>(`/invites/${code}`);
}

export async function acceptInvite(code: string): Promise<Server> {
  return req<Server>(`/invites/${code}/accept`, 'POST');
}
