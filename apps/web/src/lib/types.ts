// Client-side view types mirroring the backend serialized DTOs.

export interface ServerFolder {
  id: string;
  name: string;
  color: number;
  serverIds: string[];
  collapsed?: boolean;
}

export interface ServerLayout {
  folders: ServerFolder[];
  // Ordered top-level rail keys: a serverId, or "f:<folderId>" for a folder.
  // Unknown/stale keys are ignored on render; missing items are appended.
  order?: string[];
}

export interface User {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  friendCode?: string | null;
  status: string;
  serverLayout?: ServerLayout | null;
}

export interface Server {
  id: string;
  name: string;
  ownerId: string;
  iconUrl: string | null;
  createdAt: string;
  updatedAt: string;
  myPermissions: string;
}

export interface Role {
  id: string;
  serverId: string;
  name: string;
  color: number;
  permissions: string;
  position: number;
}

export interface ServerMemberInfo {
  userId: string;
  nickname: string | null;
  joinedAt: string;
  isOwner: boolean;
  roleIds: string[];
  user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'status'>;
}

export interface Channel {
  id: string;
  serverId: string;
  categoryId: string | null;
  name: string;
  type: 'TEXT' | 'VOICE' | 'ANNOUNCEMENT';
  topic: string | null;
  position: number;
  parentId: string | null;
}

export interface Attachment {
  id: string;
  shareAssetId: string;
  filename: string;
  mimeType: string;
  size: string;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyToId: string | null;
  pinned: boolean;
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'status'>;
  attachments: Attachment[];
  reactions: { emoji: string; count: number; userIds: string[] }[];
  replyTo: { id: string; authorName: string; content: string } | null;
  poll?: Poll | null;
  // client-only: optimistic-send bookkeeping
  nonce?: string;
  pending?: boolean;
  failed?: boolean;
}

export interface ServerSound {
  id: string;
  name: string;
  emoji: string | null;
  url: string;
}

export interface PollOption {
  id: string;
  text: string;
  voterIds: string[];
}

export interface Poll {
  id: string;
  question: string;
  multiple: boolean;
  closesAt: string | null;
  options: PollOption[];
}

export interface WsTicket {
  ticket: string;
  expiresAt: string;
}

export interface ServerInviteNotification {
  id: string;
  createdAt: string;
  server: { id: string; name: string; iconUrl: string | null };
  inviter: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
}

export interface Gif {
  id: string;
  url: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
}

export interface WatchPartyState {
  id: string;
  channelId: string;
  hostId: string;
  itemId: string;
  itemName: string;
  positionMs: number;
  paused: boolean;
  streamUrl: string;
}

export interface LibraryItem {
  id: string;
  name: string;
  type: string;
  seriesName?: string;
  runtimeMs: number | null;
  imageUrl: string | null;
}

export interface DmChannel {
  id: string;
  type: string;
  recipients: User[];
  lastMessageAt?: string | null;
}

export interface Notifications {
  friendRequests: { id: string; user: User }[];
  serverInvites: ServerInviteNotification[];
  count: number;
}
