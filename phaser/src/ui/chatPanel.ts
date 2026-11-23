// Multiplayer chat window. Owns its message history; lives outside the
// overlay's render cycle and re-attaches itself when the root is cleared.

const MAX_CHAT_MESSAGES = 100;

interface ChatMessage {
  sender: string;
  text: string;
  isSystem: boolean;
}

export interface ChatPanel {
  /** Make sure the panel is attached to the root (creating it if needed). */
  ensure(): HTMLElement;
  addMessage(empireId: number, sender: string, text: string): void;
  clearMessages(): void;
  focusInput(): void;
  /** Forget the element (e.g. after the root was cleared for a menu screen). */
  detach(): void;
}

export function createChatPanel(root: HTMLElement, sendChat: (text: string) => void): ChatPanel {
  const messages: ChatMessage[] = [];
  let panel: HTMLElement | null = null;

  function refresh(): void {
    const history = panel?.querySelector('.chat-history');
    if (!history) return;
    history.innerHTML = '';
    for (const msg of messages) {
      const line = document.createElement('div');
      line.className = msg.isSystem ? 'chat-msg chat-system' : 'chat-msg';
      line.textContent = msg.isSystem ? msg.text : `${msg.sender}: ${msg.text}`;
      history.append(line);
    }
    history.scrollTop = history.scrollHeight;
  }

  function ensure(): HTMLElement {
    if (panel && panel.parentElement) return panel;
    panel = document.createElement('div');
    panel.className = 'chat-panel interactive';

    const history = document.createElement('div');
    history.className = 'chat-history';
    panel.append(history);

    const inputRow = document.createElement('div');
    inputRow.className = 'chat-input-row';
    const chatInput = document.createElement('input');
    chatInput.type = 'text';
    chatInput.className = 'chat-input';
    chatInput.placeholder = 'Type a message...';
    chatInput.maxLength = 200;
    chatInput.autocomplete = 'off';
    chatInput.spellcheck = false;
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && chatInput.value.trim()) {
        sendChat(chatInput.value.trim());
        chatInput.value = '';
      }
      if (e.key === 'Escape') {
        chatInput.blur();
      }
      e.stopPropagation();
    });
    inputRow.append(chatInput);
    panel.append(inputRow);

    root.append(panel);
    refresh();
    return panel;
  }

  return {
    ensure,
    addMessage(empireId, sender, text) {
      messages.push({ sender, text, isSystem: empireId < 0 });
      if (messages.length > MAX_CHAT_MESSAGES) messages.shift();
      refresh();
    },
    clearMessages() {
      messages.length = 0;
      refresh();
    },
    focusInput() {
      ensure().querySelector<HTMLInputElement>('.chat-input')?.focus();
    },
    detach() {
      panel = null;
    },
  };
}
