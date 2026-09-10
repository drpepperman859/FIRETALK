import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { Room, RoomEvent, Track, createLocalAudioTrack, type LocalAudioTrack, type RemoteParticipant } from 'livekit-client';

import { homeStyles } from './app-home.styles';
import { styles as sharedStyles } from '../../shared.styles';
import { localDatabase, type ChatMessage } from '../../services/local-database';
import { conversationKey, firebaseMessagingEnabled, sendFirebaseMessage, subscribeToConversation } from '../../services/firebase-messaging';

@customElement('app-home')
export class AppHome extends LitElement {
  @state() activeConversation = 'Maya Chen';
  @state() searchTerm = '';
  @state() draft = '';
  @state() callState: 'idle' | 'requesting' | 'connecting' | 'connected' | 'error' = 'idle';
  @state() micStatus: 'requesting' | 'granted' | 'muted' | 'denied' = 'requesting';
  @state() remoteStatus = 'Waiting to join';
  @state() remoteAudioStatus = 'No audio track';
  @state() callError = '';
  @state() callRoom = '';
  @state() colorTheme: 'pink' | 'blue' | 'orange' | 'red' = 'orange';
  @state() showSettings = false;
  @state() messagingStatus: 'local' | 'connecting' | 'connected' | 'error' = firebaseMessagingEnabled ? 'connecting' : 'local';
  private room?: Room;
  private localAudioTrack?: LocalAudioTrack;
  private unsubscribeDatabase?: () => void;
  private unsubscribeFirebase?: () => void;
  private firebaseHasControl = false;
  @state() messages: ChatMessage[] = [
    { id: 1, author: 'Maya Chen', text: 'Hey! I pulled together a first pass for the launch plan.', time: '9:41 AM', own: false },
    { id: 2, author: 'You', text: 'Nice. I am looking at it now. The opening feels strong.', time: '9:43 AM', own: true },
    { id: 3, author: 'Maya Chen', text: 'That is the bit I was happiest with. Want to tighten the last section together?', time: '9:44 AM', own: false },
  ];

  static styles = [sharedStyles, homeStyles];

  protected async firstUpdated() {
    this.unsubscribeDatabase = localDatabase.subscribe(() => void this.refreshMessages());
    await this.refreshMessages();
    await this.connectFirebaseConversation();
  }

  disconnectedCallback() {
    this.unsubscribeDatabase?.();
    this.unsubscribeFirebase?.();
    super.disconnectedCallback();
  }

  private async connectFirebaseConversation() {
    this.unsubscribeFirebase?.();
    this.unsubscribeFirebase = undefined;
    this.firebaseHasControl = false;
    if (!firebaseMessagingEnabled) {
      this.messagingStatus = 'local';
      return;
    }
    this.messagingStatus = 'connecting';
    try {
      this.unsubscribeFirebase = await subscribeToConversation(
        conversationKey(this.activeConversation),
        (messages) => {
          this.messagingStatus = 'connected';
          this.firebaseHasControl = true;
          if (messages.length === 0) return;
          const uniqueMessages = this.uniqueMessages(messages);
          this.messages = uniqueMessages;
          void Promise.all(uniqueMessages.map((message) => localDatabase.saveMessage(message)));
        },
        () => { this.messagingStatus = 'error'; },
      );
      this.messagingStatus = 'connected';
    } catch {
      this.messagingStatus = 'error';
    }
  }

  private selectConversation(name: string) {
    this.activeConversation = name;
    void this.connectFirebaseConversation();
  }

  private async refreshMessages() {
    if (this.firebaseHasControl) return;
    const savedMessages = await localDatabase.getMessages();
    if (savedMessages.length > 0) {
      const messages = this.uniqueMessages(savedMessages);
      if (messages.length !== this.messages.length || messages.at(-1)?.id !== this.messages.at(-1)?.id) {
        this.messages = messages;
      }
      return;
    }
    await localDatabase.seedMessages(this.messages);
  }

  private uniqueMessages(messages: ChatMessage[]): ChatMessage[] {
    const seen = new Set<string>();
    return messages.filter((message) => {
      const signature = `${message.author}\u0000${message.text}\u0000${message.time}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }

  private sendMessage(text = this.draft) {
    const value = text.trim();
    if (!value) return;
    const message: ChatMessage = { id: Date.now(), author: 'You', text: value, time: 'Now', own: true };
    this.messages = [...this.messages, message];
    void localDatabase.saveMessage(message);
    if (firebaseMessagingEnabled) {
      void sendFirebaseMessage(this.activeConversation, { author: message.author, text: message.text, time: message.time }).catch(() => {
        this.messagingStatus = 'error';
      });
    }
    this.draft = '';
  }

  private handleSubmit(event: Event) {
    event.preventDefault();
    this.sendMessage();
  }

  private setColorTheme(theme: 'pink' | 'blue' | 'orange' | 'red') {
    this.colorTheme = theme;
    this.showSettings = false;
  }

  private async startCall() {
    this.callError = '';
    this.callState = 'requesting';
    this.micStatus = 'requesting';
    try {
      const permissionCheck = await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionCheck.getTracks().forEach((track) => track.stop());
      this.micStatus = 'granted';
      this.callState = 'connecting';
      this.callRoom = `mingle-${crypto.randomUUID().slice(0, 8)}`;
      await this.connectToRoom(this.callRoom);
    } catch (error) {
      this.callState = 'error';
      this.micStatus = 'denied';
      this.callError = error instanceof Error ? error.message : 'Microphone permission was not granted.';
    }
  }

  private async connectToRoom(roomName: string) {
    const response = await fetch('/api/livekit-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: roomName, participantName: 'Jordan Davis' }),
    });
    if (!response.ok) throw new Error('Call service is not configured. Add LiveKit server secrets and try again.');
    const { token, url } = await response.json() as { token: string; url: string };
    this.room = new Room();
    this.room.on(RoomEvent.ParticipantConnected, (participant) => this.updateRemoteParticipant(participant));
    this.room.on(RoomEvent.ParticipantDisconnected, () => {
      this.remoteStatus = 'Participant disconnected';
      this.remoteAudioStatus = 'No audio track';
    });
    this.room.on(RoomEvent.TrackSubscribed, (_track, _publication, participant) => this.updateRemoteParticipant(participant));
    this.room.on(RoomEvent.TrackUnsubscribed, (_track, _publication, participant) => this.updateRemoteParticipant(participant));
    await this.room.connect(url, token);
    this.localAudioTrack = await createLocalAudioTrack();
    await this.room.localParticipant.publishTrack(this.localAudioTrack);
    this.callState = 'connected';
    this.micStatus = 'granted';
    this.updateRemoteParticipant(this.room.remoteParticipants.values().next().value);
  }

  private updateRemoteParticipant(participant?: RemoteParticipant) {
    if (!participant) {
      this.remoteStatus = 'Waiting to join';
      this.remoteAudioStatus = 'No audio track';
      return;
    }
    this.remoteStatus = 'Connected';
    const audioPublication = Array.from(participant.trackPublications.values()).find((publication) => publication.kind === Track.Kind.Audio);
    this.remoteAudioStatus = audioPublication?.isSubscribed ? (audioPublication.isMuted ? 'Muted' : 'Receiving audio') : 'Audio not subscribed';
  }

  private toggleMute() {
    if (!this.localAudioTrack) return;
    if (this.localAudioTrack.isMuted) {
      this.localAudioTrack.unmute();
      this.micStatus = 'granted';
    } else {
      this.localAudioTrack.mute();
      this.micStatus = 'muted';
    }
  }

  private async endCall() {
    this.localAudioTrack?.stop();
    await this.room?.disconnect();
    this.room = undefined;
    this.localAudioTrack = undefined;
    this.callState = 'idle';
    this.remoteStatus = 'Waiting to join';
    this.remoteAudioStatus = 'No audio track';
  }

  render() {
    const conversations = ['Maya Chen', 'Design circle', 'Alex Morgan', 'Weekend plans'];
    return html`
      <div class="app-shell theme-${this.colorTheme}">
        <aside class="sidebar">
          <div class="brand"><span class="brand-mark">✦</span><span>FIRETALK</span></div>
          <button class="new-chat" @click="${() => this.sendMessage('New conversation started')}"><span>＋</span> New chat <kbd>⌘ K</kbd></button>
          <label class="search"><span>⌕</span><input aria-label="Search conversations" placeholder="Search" .value="${this.searchTerm}" @input="${(event: Event) => this.searchTerm = (event.target as HTMLInputElement).value}"/><kbd>⌘ F</kbd></label>
          <p class="section-label">Conversations</p>
          <nav class="conversation-list">
            ${conversations.filter((name) => name.toLowerCase().includes(this.searchTerm.toLowerCase())).map((name, index) => html`
              <button class="conversation ${this.activeConversation === name ? 'active' : ''}" @click="${() => this.selectConversation(name)}">
                <span class="avatar avatar-${index + 1}">${name.split(' ').map((part) => part[0]).join('')}</span><span class="conversation-copy"><strong>${name}</strong><small>${index === 0 ? 'That is the bit I was happiest...' : 'You: Sounds good to me'}</small></span><time>${index === 0 ? '9:44' : 'Mon'}</time>
              </button>`)}
          </nav>
          <div class="sidebar-bottom"><button class="side-link"><span>◎</span> Archive</button><button class="side-link" @click="${() => this.showSettings = !this.showSettings}"><span>⚙</span> Settings</button>${this.showSettings ? html`<div class="theme-picker" aria-label="Color theme"><strong>Color name</strong><div class="theme-options">${(['pink', 'blue', 'orange', 'red'] as const).map((theme) => html`<button class="theme-option theme-option-${theme} ${this.colorTheme === theme ? 'selected' : ''}" @click="${() => this.setColorTheme(theme)}"><span></span>${theme[0].toUpperCase() + theme.slice(1)}</button>`)}</div></div>` : nothing}<div class="profile"><span class="avatar avatar-you">JD</span><span><strong>Jordan Davis</strong><small>Available</small></span><span class="more">•••</span></div></div>
        </aside>
        <main class="chat-panel">
          <header class="chat-header"><div class="person"><span class="avatar avatar-1">MC</span><div><h1>${this.activeConversation}</h1><span class="online"><i class="${this.messagingStatus === 'connected' ? 'firebase-online' : ''}"></i> ${this.messagingStatus === 'connected' ? 'Live sync' : this.messagingStatus === 'connecting' ? 'Connecting...' : this.messagingStatus === 'error' ? 'Offline mode' : 'Local mode'}</span></div></div><div class="header-actions"><button aria-label="Start voice call" @click="${this.startCall}">☎</button><button aria-label="More conversation options">•••</button></div></header>
          ${this.callState !== 'idle' ? html`<section class="call-panel" aria-live="polite"><div class="call-title"><span class="call-pulse"></span><div><strong>${this.callState === 'connected' ? 'Live voice call' : this.callState === 'error' ? 'Call could not start' : 'Starting voice call'}</strong><small>${this.callRoom ? `Room ${this.callRoom}` : 'Secure audio room'}</small></div><button class="close-call" aria-label="End call" @click="${this.endCall}">×</button></div><div class="call-status-grid"><div class="call-status"><span class="status-dot ${this.micStatus === 'granted' ? 'good' : this.micStatus === 'muted' ? 'muted' : 'warn'}"></span><div><small>Your microphone</small><strong>${this.micStatus === 'requesting' ? 'Requesting permission...' : this.micStatus === 'denied' ? 'Permission denied' : this.micStatus === 'muted' ? 'Muted' : 'Granted and published'}</strong></div></div><div class="call-status"><span class="status-dot ${this.remoteStatus === 'Connected' ? 'good' : 'warn'}"></span><div><small>Remote participant</small><strong>${this.remoteStatus}</strong><em>${this.remoteAudioStatus}</em></div></div></div>${this.callError ? html`<p class="call-error">${this.callError}</p>` : nothing}<div class="call-actions">${this.callState === 'connected' ? html`<button class="mute-button ${this.micStatus === 'muted' ? 'is-muted' : ''}" @click="${this.toggleMute}">${this.micStatus === 'muted' ? 'Unmute microphone' : 'Mute microphone'}</button>` : nothing}<button class="end-button" @click="${this.endCall}">End call</button></div></section>` : nothing}
          <section class="messages" aria-live="polite"><div class="day-divider"><span>Today</span></div>${this.messages.map((message) => html`<article class="message ${message.own ? 'own' : ''}"><span class="avatar avatar-${message.own ? 'you' : '1'}">${message.own ? 'JD' : 'MC'}</span><div class="message-body"><div class="message-meta"><strong>${message.author}</strong><time>${message.time}</time></div><p>${message.text}</p></div></article>`)}</section>
          <div class="composer-wrap"><div class="quick-replies"><button @click="${() => this.sendMessage('Sounds good to me')}">Sounds good to me</button><button @click="${() => this.sendMessage('I will take a look')}">I will take a look</button></div><form class="composer" @submit="${this.handleSubmit}"><button type="button" class="icon-button" aria-label="Attach a file">＋</button><input aria-label="Message" placeholder="Write a message..." .value="${this.draft}" @input="${(event: Event) => this.draft = (event.target as HTMLInputElement).value}"/><button type="button" class="icon-button" aria-label="Add emoji">☺</button><button class="send-button" type="submit" aria-label="Send message">↑</button></form><p class="composer-hint">Press <b>Enter</b> to send <span>•</span> <b>Shift + Enter</b> for a new line</p></div>
        </main>
      </div>
    `;
  }
}
