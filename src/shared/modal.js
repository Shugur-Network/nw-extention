/**
 * Shared Modal Utility
 * Provides a consistent modal dialog system across all UI pages
 */

class Modal {
  constructor() {
    this.createModalContainer();
  }

  createModalContainer() {
    // Check if modal already exists
    if (document.getElementById("app-modal-overlay")) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = "app-modal-overlay";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-container">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title" id="modal-title"></h3>
            <button class="modal-close" id="modal-close" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body" id="modal-body"></div>
          <div class="modal-footer" id="modal-footer">
            <button class="modal-btn modal-btn-primary" id="modal-confirm">OK</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Add styles
    this.injectStyles();

    // Event listeners
    document.getElementById("modal-close").addEventListener("click", () => {
      this.hide();
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        this.hide();
      }
    });

    document.getElementById("modal-confirm").addEventListener("click", () => {
      if (this.onConfirm) {
        this.onConfirm();
      }
      this.hide();
    });

    // Escape key to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isVisible()) {
        this.hide();
      }
    });
  }

  injectStyles() {
    if (document.getElementById("modal-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "modal-styles";
    style.textContent = `
      .modal-overlay {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.15s ease;
      }

      .modal-overlay.active {
        display: flex;
      }

      .modal-container {
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        max-width: 480px;
        width: 90%;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        animation: slideUp 0.2s ease;
      }

      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1px solid #f0f0f0;
      }

      .modal-title {
        font-size: 18px;
        font-weight: 600;
        color: #0a0a0a;
        margin: 0;
        letter-spacing: -0.01em;
      }

      .modal-close {
        background: none;
        border: none;
        font-size: 28px;
        color: #999;
        cursor: pointer;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.15s;
        line-height: 1;
      }

      .modal-close:hover {
        background: #f5f5f5;
        color: #0a0a0a;
      }

      .modal-body {
        padding: 24px;
        overflow-y: auto;
        flex: 1;
        color: #333;
        font-size: 14px;
        line-height: 1.6;
      }

      .modal-body p {
        margin: 0 0 12px 0;
      }

      .modal-body p:last-child {
        margin-bottom: 0;
      }

      .modal-footer {
        padding: 16px 24px;
        border-top: 1px solid #f0f0f0;
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }

      .modal-btn {
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
        border: 1px solid #e8e8e8;
        background: #fafafa;
        color: #0a0a0a;
      }

      .modal-btn:hover {
        background: #f5f5f5;
        border-color: #d8d8d8;
      }

      .modal-btn-primary {
        background: #0a0a0a;
        color: #ffffff;
        border-color: #0a0a0a;
      }

      .modal-btn-primary:hover {
        background: #1a1a1a;
        border-color: #1a1a1a;
      }

      .modal-btn-danger {
        background: #dc3545;
        color: #ffffff;
        border-color: #dc3545;
      }

      .modal-btn-danger:hover {
        background: #c82333;
        border-color: #bd2130;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes slideUp {
        from { 
          opacity: 0;
          transform: translateY(20px);
        }
        to { 
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(style);
  }

  show({
    title = "Notice",
    message = "",
    type = "info",
    confirmText = "OK",
    onConfirm = null,
  }) {
    this.onConfirm = onConfirm;

    const overlay = document.getElementById("app-modal-overlay");
    const titleEl = document.getElementById("modal-title");
    const bodyEl = document.getElementById("modal-body");
    const confirmBtn = document.getElementById("modal-confirm");

    titleEl.textContent = title;
    bodyEl.innerHTML = message;
    confirmBtn.textContent = confirmText;

    // Apply type styling
    confirmBtn.className = "modal-btn modal-btn-primary";
    if (type === "error" || type === "danger") {
      confirmBtn.className = "modal-btn modal-btn-danger";
    }

    overlay.classList.add("active");
    confirmBtn.focus();
  }

  confirm({
    title = "Confirm",
    message = "",
    confirmText = "Confirm",
    cancelText = "Cancel",
    onConfirm = null,
    onCancel = null,
  }) {
    const overlay = document.getElementById("app-modal-overlay");
    const titleEl = document.getElementById("modal-title");
    const bodyEl = document.getElementById("modal-body");
    const footerEl = document.getElementById("modal-footer");

    titleEl.textContent = title;
    bodyEl.innerHTML = message;

    // Create custom footer with two buttons
    footerEl.innerHTML = `
      <button class="modal-btn" id="modal-cancel">${cancelText}</button>
      <button class="modal-btn modal-btn-primary" id="modal-confirm-action">${confirmText}</button>
    `;

    document.getElementById("modal-cancel").addEventListener("click", () => {
      if (onCancel) {
        onCancel();
      }
      this.hide();
    });

    document
      .getElementById("modal-confirm-action")
      .addEventListener("click", () => {
        if (onConfirm) {
          onConfirm();
        }
        this.hide();
      });

    overlay.classList.add("active");
    document.getElementById("modal-confirm-action").focus();
  }

  hide() {
    const overlay = document.getElementById("app-modal-overlay");
    overlay.classList.remove("active");
    this.onConfirm = null;

    // Reset footer to default
    const footerEl = document.getElementById("modal-footer");
    footerEl.innerHTML =
      '<button class="modal-btn modal-btn-primary" id="modal-confirm">OK</button>';

    // Re-attach default confirm handler
    document.getElementById("modal-confirm").addEventListener("click", () => {
      if (this.onConfirm) {
        this.onConfirm();
      }
      this.hide();
    });
  }

  isVisible() {
    const overlay = document.getElementById("app-modal-overlay");
    return overlay && overlay.classList.contains("active");
  }
}

// Create global modal instance
const modal = new Modal();

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = { modal };
}
