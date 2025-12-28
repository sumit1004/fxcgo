/* Importer Dashboard Controller */
(function () {
    'use strict';

    const importerFirebaseConfig = {
        apiKey: "AIzaSyAR-xJ3WZsw8m9ZE97hDRiHFaU0Uilq9Lw",
        authDomain: "impoter-9e6bf.firebaseapp.com",
        databaseURL: "https://impoter-9e6bf-default-rtdb.firebaseio.com",
        projectId: "impoter-9e6bf",
        storageBucket: "impoter-9e6bf.firebasestorage.app",
        messagingSenderId: "663462993062",
        appId: "1:663462993062:web:be35a602082d488315e867",
        measurementId: "G-7ZHY799QTS"
    };

    const statusClassMap = {
        'In Transit': 'status-in-transit',
        'Arrived at Port': 'status-arrived',
        'Under Customs Check': 'status-customs',
        'Cleared': 'status-cleared',
        'Out for Delivery': 'status-out-for-delivery',
        'Delivered': 'status-delivered'
    };

    const defaultFaqs = [
        'How to download documents?',
        'How to track shipment?',
        'How to make payment?',
        'What to do in case of delay?',
        'How disputes work?'
    ];

    const defaultDocumentTypes = [
        'Commercial Invoice',
        'Packing List',
        'Bill of Lading / Airway Bill',
        'Insurance Certificate',
        'Customs Declaration',
        'Compliance Documents'
    ];

    let importerApp = null;
    let importerAuth = null;
    let importerDatabase = null;
    let currentUser = null;
    let currentUserBasePath = '';
    const realtimeBindings = [];

    // Exporter Firebase Configuration (for marketplace)
    const exporterFirebaseConfig = {
        apiKey: "AIzaSyDiQ-R5oJ124N3fhm9Nhs7sC5yJZQM43Ts",
        authDomain: "expoter-af015.firebaseapp.com",
        databaseURL: "https://expoter-af015-default-rtdb.firebaseio.com",
        projectId: "expoter-af015",
        storageBucket: "expoter-af015.firebasestorage.app",
        messagingSenderId: "1094581941288",
        appId: "1:1094581941288:web:43f872395cf17eafd1311d",
        measurementId: "G-GSYX71VGVF"
    };

    let exporterApp = null;
    let exporterDatabase = null;

    function initFirebase() {
        try {
            const existing = firebase.apps.find(app => app.name === 'importerApp');
            importerApp = existing || firebase.initializeApp(importerFirebaseConfig, 'importerApp');
            importerAuth = importerApp.auth();
            importerDatabase = importerApp.database();
        } catch (error) {
            console.warn('Failed to bootstrap importer Firebase app:', error);
        }

        // Initialize exporter Firebase for marketplace
        try {
            const existingExporter = firebase.apps.find(app => app.name === 'exporterApp');
            if (existingExporter) {
                exporterApp = existingExporter;
            } else {
                exporterApp = firebase.initializeApp(exporterFirebaseConfig, 'exporterApp');
            }
            exporterDatabase = exporterApp.database();
            console.log('Exporter Firebase initialized successfully');
        } catch (error) {
            console.error('Failed to bootstrap exporter Firebase app:', error);
            console.error('Error details:', error.message, error.code);
        }
    }

    const sectionTitleMap = {
        dashboard: 'Dashboard',
        documents: 'Documents',
        contracts: 'Forward Contracts',
        support: 'Support',
        notifications: 'Notifications',
        marketplace: 'Marketplace',
        cart: 'My Cart'
    };

    const DEFAULT_TAB = 'dashboard';

    /**
     * Escape HTML to prevent XSS attacks
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
    let activeTab = null;

    function normalizeTab(target) {
        if (!target) return DEFAULT_TAB;
        return sectionTitleMap[target] ? target : DEFAULT_TAB;
    }

    function activateSection(target, options = {}) {
        const normalizedTab = normalizeTab(target);
        const { syncHash = true, force = false } = options;
        if (!force && activeTab === normalizedTab) {
            if (syncHash) {
                const currentUrl = `${window.location.pathname}${window.location.search}#${normalizedTab}`;
                if (window.location.hash !== `#${normalizedTab}`) {
                    window.history.replaceState(null, '', currentUrl);
                }
            }
            return;
        }
        activeTab = normalizedTab;

        document.querySelectorAll('.nav-link[data-tab]').forEach(link => {
            const isActive = link.dataset.tab === normalizedTab;
            link.classList.toggle('active', isActive);
            link.setAttribute('aria-selected', String(isActive));
            link.tabIndex = isActive ? 0 : -1;
            if (isActive && link.id) {
                document.querySelector('.nav-list[role="tablist"]')?.setAttribute('aria-activedescendant', link.id);
            }
        });

        document.querySelectorAll('.content-section[data-section]').forEach(section => {
            const isActive = section.dataset.section === normalizedTab;
            section.classList.toggle('active', isActive);
            section.toggleAttribute('hidden', !isActive);
        });
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
            pageTitle.textContent = sectionTitleMap[normalizedTab] || sectionTitleMap[DEFAULT_TAB];
        }
        if (syncHash) {
            const newUrl = `${window.location.pathname}${window.location.search}#${normalizedTab}`;
            window.history.replaceState(null, '', newUrl);
        }
        
        // Load documents when documents tab is activated
        if (normalizedTab === 'documents') {
            setTimeout(() => {
                if (typeof loadImporterDocumentsFromFirebase === 'function') {
                    loadImporterDocumentsFromFirebase();
                }
                if (typeof initializeImporterDocumentsModule === 'function') {
                    initializeImporterDocumentsModule();
                }
            }, 100);
        }
        
        // Load marketplace when marketplace tab is activated
        if (normalizedTab === 'marketplace') {
            setTimeout(() => {
                if (typeof loadMarketplaceProducts === 'function') {
                    loadMarketplaceProducts();
                }
            }, 100);
        }
        
        // Load cart when cart tab is activated
        if (normalizedTab === 'cart') {
            setTimeout(() => {
                if (typeof loadImporterCart === 'function') {
                    loadImporterCart();
                }
                if (typeof loadImporterOrderHistory === 'function') {
                    loadImporterOrderHistory();
                }
            }, 100);
        }
        
        // Load forward contracts when contracts tab is activated
        if (normalizedTab === 'contracts') {
            setTimeout(() => {
                if (typeof loadImporterForwardContractsInPayments === 'function') {
                    loadImporterForwardContractsInPayments();
                }
            }, 100);
        }
    }

    function handleTabKeydown(event) {
        const key = event.key;
        const allowedKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ', 'Spacebar'];
        if (!allowedKeys.includes(key)) return;
        const navLinks = Array.from(document.querySelectorAll('.nav-link[data-tab]'));
        const currentIndex = navLinks.indexOf(event.currentTarget);
        if (currentIndex === -1) return;

        if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
            event.preventDefault();
            activateSection(event.currentTarget.dataset.tab);
            return;
        }

        let nextIndex = currentIndex;
        if (key === 'ArrowUp' || key === 'ArrowLeft') {
            nextIndex = (currentIndex - 1 + navLinks.length) % navLinks.length;
        } else if (key === 'ArrowDown' || key === 'ArrowRight') {
            nextIndex = (currentIndex + 1) % navLinks.length;
        } else if (key === 'Home') {
            nextIndex = 0;
        } else if (key === 'End') {
            nextIndex = navLinks.length - 1;
        } else {
            return;
        }

        event.preventDefault();
        const nextLink = navLinks[nextIndex];
        nextLink?.focus();
        if (nextLink) {
            activateSection(nextLink.dataset.tab);
        }
    }

    function showToast(message) {
        const toast = document.getElementById('importerToast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3200);
    }

    function setStatusBadge(text, intent = 'info') {
        const badge = document.getElementById('importerStatusBadge');
        if (!badge) return;
        const intentColors = {
            info: { bg: '#e0f2fe', color: '#075985' },
            success: { bg: '#dcfce7', color: '#166534' },
            warning: { bg: '#fef9c3', color: '#92400e' },
            danger: { bg: '#fee2e2', color: '#991b1b' }
        };
        badge.textContent = text;
        const palette = intentColors[intent] || intentColors.info;
        badge.style.background = palette.bg;
        badge.style.color = palette.color;
    }

    function convertToArray(data) {
        if (!data) return [];
        if (Array.isArray(data)) return data.filter(Boolean);
        return Object.keys(data).map(key => ({ id: key, ...data[key] }));
    }

    function formatDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    function clearRealtimeBindings() {
        realtimeBindings.forEach(binding => {
            try {
                if (binding.ref && binding.listener) {
                    // Check if ref is still valid by checking if it has the off method
                    if (typeof binding.ref.off === 'function') {
                        // Firebase Realtime Database off() only takes eventType and callback
                        // Error handler is not used in off()
                        binding.ref.off('value', binding.listener);
                    }
                }
            } catch (error) {
                // Silently handle errors when cleaning up listeners
                // This can happen if the listener was already removed or ref is invalid
                console.warn('Error removing listener:', error);
            }
        });
        realtimeBindings.length = 0;
    }

    function bindRealtime(path, handler) {
        if (!importerDatabase) return;
        const ref = importerDatabase.ref(path);
        const listener = snapshot => {
            const data = snapshot.val();
            // Ensure we always pass an object, never null
            handler(data || {});
        };
        const errorHandler = error => {
            console.error(`Error binding to ${path}:`, error);
            if (error.code === 'PERMISSION_DENIED' || error.code === 'permission_denied') {
                console.warn(`Permission denied for ${path}. Please configure Firebase security rules.`);
            }
            // Call handler with empty object on error to prevent null errors
            handler({});
        };
        ref.on('value', listener, errorHandler);
        realtimeBindings.push({ ref, listener, errorHandler });
    }

    function emptyState(message) {
        return `<div class="empty-state">${message}</div>`;
    }

    function renderSummaryCards(data = {}) {
        // Ensure data is always an object, never null
        if (!data || typeof data !== 'object') {
            data = {};
        }

        document.getElementById('summaryActiveShipments').textContent = data.activeShipments ?? 0;
        document.getElementById('summaryPendingPayments').textContent = data.pendingPayments ?? 0;
        document.getElementById('summaryPendingVerification').textContent = data.pendingVerification ?? 0;
        document.getElementById('summaryDeliveredShipments').textContent = data.deliveredShipments ?? 0;
    }

    function renderDocumentsSection(data = {}) {
        // Ensure data is always an object, never null
        if (!data || typeof data !== 'object') {
            data = {};
        }

        const list = document.getElementById('documentsList');
        if (!list) return;
        list.innerHTML = '';

        const viewBtn = document.getElementById('documentsViewBtn');
        const downloadBtn = document.getElementById('documentsDownloadBtn');
        if (viewBtn) viewBtn.dataset.url = data.viewUrl || '';
        if (downloadBtn) downloadBtn.dataset.url = data.downloadUrl || '';

        // Safely access files property
        const documents = convertToArray(data && data.files ? data.files : null);
        const template = documents.length ? documents : defaultDocumentTypes.map(type => ({ type, status: 'Waiting for upload' }));

        template.forEach(doc => {
            const card = document.createElement('div');
            card.className = 'document-card';
            card.innerHTML = `
                <p><strong>${doc.type || doc.name}</strong></p>
                <small>${doc.status || 'Available online'}</small><br>
                ${doc.updatedAt ? `<small>Updated: ${formatDate(doc.updatedAt)}</small>` : ''}
            `;
            list.appendChild(card);
        });
    }

    function renderSupportModule(data = {}) {
        // Ensure data is always an object, never null
        if (!data || typeof data !== 'object') {
            data = {};
        }

        const chatLog = document.getElementById('supportChatLog');
        const faqList = document.getElementById('supportFaqList');

        if (chatLog) {
            chatLog.innerHTML = '';
            // Safely access messages property
            const messages = convertToArray(data && data.messages ? data.messages : null).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            if (!messages.length) {
                chatLog.innerHTML = emptyState('Chat history will appear here.');
            } else {
                messages.forEach(msg => {
                    const entry = document.createElement('div');
                    entry.className = 'chat-entry';
                    entry.innerHTML = `
                        <strong>${msg.author || 'Support Bot'}</strong>
                        <p>${msg.message || ''}</p>
                        <small>${formatDate(msg.createdAt)}</small>
                    `;
                    chatLog.appendChild(entry);
                });
                chatLog.scrollTop = chatLog.scrollHeight;
            }
        }

        if (faqList) {
            faqList.innerHTML = '';
            const faqs = convertToArray(data.faqs);
            const topics = faqs.length ? faqs.map(item => item.title || item.question) : defaultFaqs;
            topics.forEach(topic => {
                const li = document.createElement('li');
                li.textContent = topic;
                faqList.appendChild(li);
            });
        }
    }

    function renderNotifications(data = {}) {
        // Ensure data is always an object, never null
        if (!data || typeof data !== 'object') {
            data = {};
        }

        const list = document.getElementById('notificationsList');
        if (!list) return;
        list.innerHTML = '';
        
        // Escape HTML helper
        const escapeHtml = (text) => {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = String(text);
            return div.innerHTML;
        };
        
        // Handle both data.items structure and direct notifications object
        let notifications = [];
        if (data.items) {
            notifications = convertToArray(data.items);
        } else {
            // If data is directly notifications object (from Firebase push keys)
            notifications = convertToArray(data);
        }
        
        if (!notifications.length) {
            list.innerHTML = emptyState('You are all caught up.');
            // Update notification badge
            const badge = document.getElementById('notificationCounter');
            if (badge) badge.textContent = '0';
            return;
        }
        
        // Update notification badge
        const badge = document.getElementById('notificationCounter');
        if (badge) {
            const unreadCount = notifications.filter(n => !n.read).length;
            badge.textContent = unreadCount > 0 ? unreadCount : '';
            badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
        }
        
        notifications
            .sort((a, b) => {
                const dateA = new Date(a.createdAt || 0);
                const dateB = new Date(b.createdAt || 0);
                return dateB - dateA;
            })
            .forEach(notification => {
                const item = document.createElement('div');
                item.className = 'notification-item';
                if (!notification.read) {
                    item.style.borderLeft = '3px solid #0ea5e9';
                    item.style.background = '#f0f9ff';
                }
                
                // Handle different notification types
                let notificationHTML = '';
                
                if (notification.type === 'order_update') {
                    // Order update notification with documents
                    const hasDocs = notification.hasDocuments && notification.documentCount > 0;
                    const updateData = notification.updateData || {};
                    
                    notificationHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                            <div style="flex: 1;">
                                <strong style="color: #0ea5e9; display: flex; align-items: center; gap: 0.5rem;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                        <polyline points="14 2 14 8 20 8"></polyline>
                                    </svg>
                                    Order Update
                                </strong>
                                <p style="margin: 0.5rem 0; color: #334155;">${escapeHtml(notification.message || 'New update for your order')}</p>
                                ${notification.orderId ? `<p style="margin: 0.25rem 0; font-size: 0.85rem; color: #64748b;">Order #${escapeHtml(notification.orderId)}</p>` : ''}
                                ${notification.exporterName ? `<p style="margin: 0.25rem 0; font-size: 0.85rem; color: #64748b;">From: ${escapeHtml(notification.exporterName)}</p>` : ''}
                            </div>
                            <small style="color: #94a3b8; white-space: nowrap; margin-left: 1rem;">${formatDate(notification.createdAt)}</small>
                        </div>
                        ${updateData.message ? `<div style="padding: 0.75rem; background: white; border-radius: 8px; margin: 0.5rem 0; border-left: 3px solid #0ea5e9;"><p style="margin: 0; color: #334155;">${escapeHtml(updateData.message)}</p></div>` : ''}
                        ${hasDocs && updateData.documents && updateData.documents.length > 0 ? `
                            <div style="margin-top: 0.75rem;">
                                <p style="font-weight: 500; margin-bottom: 0.5rem; color: #334155; font-size: 0.9rem;">📎 Documents (${updateData.documents.length}):</p>
                                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                    ${updateData.documents.map(doc => {
                                        const docUrl = doc.base64 ? `data:${doc.fileType || 'application/octet-stream'};base64,${doc.base64}` : '#';
                                        return `
                                            <a href="${docUrl}" download="${escapeHtml(doc.fileName || 'document')}" target="_blank" style="display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.5rem 0.75rem; background: #0ea5e9; color: white; border-radius: 6px; text-decoration: none; font-size: 0.85rem; transition: background 0.2s; hover:background: #0284c7;">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                    <polyline points="7 10 12 15 17 10"></polyline>
                                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                                </svg>
                                                ${escapeHtml(doc.fileName || 'Document')}
                                            </a>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        ` : ''}
                    `;
                } else if (notification.type === 'new_order') {
                    // New order notification
                    notificationHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <div>
                                <strong style="color: #10b981;">🛒 New Order</strong>
                                <p style="margin: 0.5rem 0; color: #334155;">${escapeHtml(notification.message || 'You have a new order')}</p>
                                ${notification.orderId ? `<p style="margin: 0.25rem 0; font-size: 0.85rem; color: #64748b;">Order #${escapeHtml(notification.orderId)}</p>` : ''}
                            </div>
                            <small style="color: #94a3b8;">${formatDate(notification.createdAt)}</small>
                        </div>
                    `;
                } else {
                    // Regular notification
                    notificationHTML = `
                        <strong>${escapeHtml(notification.title || notification.type || 'Update')}</strong>
                        <p>${escapeHtml(notification.message || '')}</p>
                        <small>${formatDate(notification.createdAt)}</small>
                    `;
                }
                
                item.innerHTML = notificationHTML;
                list.appendChild(item);
            });
    }

    function handleSupportMessageSubmit(event) {
        event.preventDefault();
        if (!currentUser || !importerDatabase) {
            showToast('Not connected to Firebase.');
            return;
        }
        const form = event.target;
        const message = form.message.value.trim();
        if (!message) {
            showToast('Enter a message first.');
            return;
        }
        const payload = {
            message,
            author: currentUser.displayName || currentUser.email || 'Importer',
            createdAt: Date.now()
        };
        importerDatabase.ref(`${currentUserBasePath}/support/messages`).push(payload)
            .then(() => {
                form.reset();
                showToast('Message sent to support.');
            })
            .catch(() => showToast('Failed to send message.'));
    }

    function handleDocumentAction(event) {
        const url = event.currentTarget.dataset.url;
        if (!url) {
            showToast('Document link not available yet.');
            return;
        }
        window.open(url, '_blank', 'noopener');
    }

    function attachEvents() {
        document.querySelectorAll('.nav-link[data-tab]').forEach(link => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                activateSection(link.dataset.tab);
                link.focus();
            });
            link.addEventListener('keydown', handleTabKeydown);
        });

        document.getElementById('supportMessageForm')?.addEventListener('submit', handleSupportMessageSubmit);
        document.getElementById('documentsViewBtn')?.addEventListener('click', handleDocumentAction);
        document.getElementById('documentsDownloadBtn')?.addEventListener('click', handleDocumentAction);

        document.getElementById('refreshImporterData')?.addEventListener('click', () => {
            setStatusBadge('Syncing…', 'info');
            showToast('Listening for realtime updates.');
        });

        document.getElementById('importerLogoutBtn')?.addEventListener('click', async () => {
            if (!importerAuth) {
                window.location.href = '../index.html';
                return;
            }
            clearRealtimeBindings();
            await importerAuth.signOut();
            window.location.href = '../index.html';
        });

        const sidebar = document.getElementById('sidebar');
        const sidebarToggle = document.getElementById('sidebarToggle');
        const mobileMenuToggle = document.getElementById('mobileMenuToggle');
        const toggleSidebar = () => sidebar?.classList.toggle('open');
        sidebarToggle?.addEventListener('click', toggleSidebar);
        mobileMenuToggle?.addEventListener('click', toggleSidebar);
    }

    function startRealtimeSync(uid) {
        if (!importerDatabase) return;
        currentUserBasePath = `importers/${uid}`;
        clearRealtimeBindings();
        bindRealtime(`${currentUserBasePath}/summary`, renderSummaryCards);
        bindRealtime(`${currentUserBasePath}/documents`, renderDocumentsSection);
        bindRealtime(`${currentUserBasePath}/support`, renderSupportModule);
        bindRealtime(`${currentUserBasePath}/notifications`, renderNotifications);
        setStatusBadge('Synced', 'success');
        checkImporterEKYCStatus();
        listenForImporterEKYCStatusChanges();
    }

    function initAuthListener() {
        if (!importerAuth) {
            showToast('Firebase auth not available.');
            return;
        }
        importerAuth.onAuthStateChanged(user => {
            if (!user) {
                clearRealtimeBindings();
                window.location.href = '../index.html';
                return;
            }
            currentUser = user;
            const usernameEl = document.getElementById('importerUserName');
            if (usernameEl) {
                usernameEl.textContent = user.displayName || user.email || 'Importer Workspace';
            }
            startRealtimeSync(user.uid);
        });
    }

    // ============================================
    // eKYC FUNCTIONALITY
    // ============================================

    // Document options based on country
    const INDIAN_ID_PROOFS = [
        { value: 'aadhaar', label: 'Aadhaar Card' },
        { value: 'pan', label: 'PAN Card' },
        { value: 'passport', label: 'Passport' },
        { value: 'driving-license', label: 'Driving License' },
        { value: 'voter-id', label: 'Voter ID' }
    ];

    const INTERNATIONAL_ID_PROOFS = [
        { value: 'passport', label: 'Passport' },
        { value: 'national-id', label: 'National Identity Card' },
        { value: 'driving-license', label: 'Driving License' }
    ];

    const INDIAN_BUSINESS_PROOFS = [
        { value: 'gst-certificate', label: 'GST Certificate' },
        { value: 'iec-certificate', label: 'IEC Certificate' },
        { value: 'company-registration', label: 'Company Registration Certificate' },
        { value: 'partnership-deed', label: 'Partnership Deed' },
        { value: 'llp-agreement', label: 'LLP Agreement' }
    ];

    const INTERNATIONAL_BUSINESS_PROOFS = [
        { value: 'business-license', label: 'Business License' },
        { value: 'company-registration', label: 'Company Registration Certificate' },
        { value: 'tax-certificate', label: 'Tax Registration Certificate' },
        { value: 'trade-license', label: 'Trade License' }
    ];

    const INDIAN_BANK_PROOFS = [
        { value: 'cancelled-cheque', label: 'Cancelled Cheque' },
        { value: 'bank-statement', label: 'Bank Statement' },
        { value: 'bank-certificate', label: 'Bank Certificate' }
    ];

    const INTERNATIONAL_BANK_PROOFS = [
        { value: 'bank-statement', label: 'Bank Statement' },
        { value: 'bank-certificate', label: 'Bank Certificate' },
        { value: 'swift-confirmation', label: 'SWIFT Confirmation' }
    ];

    let importerUserCountry = null;
    let importerEkycData = null;
    let importerSelfieDataUrl = null;
    let importerCameraStream = null;
    let importerLocalStream = null;
    let importerRemoteStream = null;
    let importerPeerConnection = null;
    let importerVideoCallRequestId = null;
    let importerVideoCallListener = null;

    // WebRTC Configuration
    const importerRtcConfiguration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
    }

    function handleImporterEKYCButtonClick() {
        try {
            openImporterEKYCModal().catch(error => {
                console.error('Async open failed, trying fallback:', error);
                forceOpenImporterEKYCModal();
            });
        } catch (error) {
            console.error('Error in button handler:', error);
            forceOpenImporterEKYCModal();
        }
    }

    async function checkImporterEKYCStatus() {
        if (!currentUser || !importerDatabase) return;

        try {
            const ekycRef = importerDatabase.ref(`${currentUserBasePath}/ekyc`);
            ekycRef.once('value', snapshot => {
                const ekycCard = document.getElementById('importerEkycCard');
                const ekycStatusCard = document.getElementById('importerEkycStatusCard');
                const videoCallRequestCard = document.getElementById('importerVideoCallRequestCard');

                if (!snapshot.exists()) {
                    if (ekycCard) ekycCard.style.display = 'block';
                    if (ekycStatusCard) ekycStatusCard.style.display = 'none';
                    if (videoCallRequestCard) videoCallRequestCard.style.display = 'none';
                    return;
                }

                importerEkycData = snapshot.val();
                if (importerEkycData.ekycCompleted !== true) {
                    if (ekycCard) ekycCard.style.display = 'block';
                    if (ekycStatusCard) ekycStatusCard.style.display = 'none';
                    if (videoCallRequestCard) videoCallRequestCard.style.display = 'none';
                    return;
                }

                if (ekycCard) ekycCard.style.display = 'none';
                if (ekycStatusCard) ekycStatusCard.style.display = 'block';

                const statusIcon = document.getElementById('importerEkycStatusIcon');
                const statusTitle = document.getElementById('importerEkycStatusTitle');
                const statusMessage = document.getElementById('importerEkycStatusMessage');

                if (statusIcon && statusTitle && statusMessage) {
                    const status = importerEkycData.ekycStatus || 'pending';
                    if (status === 'verified' || status === 'approved') {
                        statusIcon.textContent = '✓';
                        statusIcon.style.color = '#10b981';
                        statusTitle.textContent = 'eKYC Completed';
                        statusMessage.textContent = 'Your eKYC has been verified successfully. You can now access all features.';
                        if (videoCallRequestCard) videoCallRequestCard.style.display = 'none';
                    } else if (status === 'rejected') {
                        statusIcon.textContent = '✗';
                        statusIcon.style.color = '#ef4444';
                        statusTitle.textContent = 'eKYC Rejected';
                        statusMessage.textContent = 'Your eKYC verification was rejected. Reason: ' + (importerEkycData.rejectionReason || 'Not provided') + '. Please contact support to resubmit.';
                        if (videoCallRequestCard) videoCallRequestCard.style.display = 'none';
                    } else {
                        statusIcon.textContent = '📹';
                        statusIcon.style.color = '#3b82f6';
                        statusTitle.textContent = 'eKYC Submitted - Awaiting Verification';
                        statusMessage.textContent = 'Your documents have been received. Complete your verification with a video call to finish the process.';
                        if (videoCallRequestCard) videoCallRequestCard.style.display = 'block';
                    }
                }
            }).catch(error => {
                console.error('Error checking eKYC status:', error);
                // Permission errors are expected if rules aren't set up yet
                if (error.code === 'PERMISSION_DENIED' || error.code === 'permission_denied') {
                    console.warn('Permission denied. Please configure Firebase security rules.');
                    // Show eKYC card if permission denied (user hasn't set up rules yet)
                    const ekycCard = document.getElementById('importerEkycCard');
                    if (ekycCard) ekycCard.style.display = 'block';
                }
            });
        } catch (error) {
            console.error('Error checking eKYC status:', error);
        }
    }

    function listenForImporterEKYCStatusChanges() {
        if (!currentUser || !importerDatabase) return;
        const ekycRef = importerDatabase.ref(`${currentUserBasePath}/ekyc`);
        const listener = snapshot => {
            if (snapshot.exists()) {
                importerEkycData = snapshot.val();
                checkImporterEKYCStatus();
            } else {
                importerEkycData = null;
                checkImporterEKYCStatus();
            }
        };
        const errorHandler = error => {
            console.error('Error listening for eKYC status changes:', error);
            // Permission errors are expected if rules aren't set up yet
            if (error.code === 'PERMISSION_DENIED' || error.code === 'permission_denied') {
                console.warn('Permission denied. Please configure Firebase security rules.');
            }
        };
        ekycRef.on('value', listener, errorHandler);
        realtimeBindings.push({ ref: ekycRef, listener, errorHandler });
    }

    async function openImporterEKYCModal() {
        const modal = document.getElementById('importerEkycModal');
        if (!modal) {
            console.error('eKYC modal element not found');
            return;
        }

        if (!currentUser) {
            showToast('Please login to complete eKYC');
            return;
        }

        try {
            if (importerDatabase) {
                const userRef = importerDatabase.ref(`${currentUserBasePath}/profile/address`);
                const snapshot = await userRef.once('value').catch(error => {
                    if (error.code === 'PERMISSION_DENIED' || error.code === 'permission_denied') {
                        console.warn('Permission denied. Using default country.');
                        return null;
                    }
                    throw error;
                });
                if (snapshot && snapshot.exists()) {
                    const userData = snapshot.val();
                    importerUserCountry = userData.country || 'India';
                } else {
                    importerUserCountry = 'India';
                }
            } else {
                importerUserCountry = 'India';
            }
        } catch (error) {
            console.error('Error fetching user country:', error);
            importerUserCountry = 'India';
        }

        try {
            if (importerDatabase) {
                const ekycRef = importerDatabase.ref(`${currentUserBasePath}/ekyc`);
                const snapshot = await ekycRef.once('value').catch(error => {
                    if (error.code === 'PERMISSION_DENIED' || error.code === 'permission_denied') {
                        console.warn('Permission denied. Proceeding with eKYC form.');
                        return null;
                    }
                    throw error;
                });
                if (snapshot && snapshot.exists()) {
                    importerEkycData = snapshot.val();
                    if (importerEkycData.ekycCompleted === true) {
                        showToast('You have already completed your eKYC.');
                        return;
                    }
                } else {
                    importerEkycData = null;
                }
            }
        } catch (error) {
            console.error('Error checking existing eKYC:', error);
            importerEkycData = null;
        }

        populateImporterEKYCForm();
        if (importerEkycData && importerEkycData.ekycCompleted !== true) {
            prefillImporterEKYCForm();
        }

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function forceOpenImporterEKYCModal() {
        const modal = document.getElementById('importerEkycModal');
        if (!modal) return;
        if (!importerUserCountry) importerUserCountry = 'India';
        populateImporterEKYCForm();
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closeImporterEKYCModal() {
        const modal = document.getElementById('importerEkycModal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        stopImporterCamera();
        importerSelfieDataUrl = null;
        const selfieInput = document.getElementById('importerSelfieFile');
        if (selfieInput) {
            selfieInput.value = '';
            selfieInput.removeAttribute('data-valid');
        }
        const form = document.getElementById('importerEkycForm');
        if (form) {
            form.reset();
            clearImporterFilePreviews();
        }
        const message = document.getElementById('importerEkycMessage');
        if (message) {
            message.textContent = '';
            message.className = 'ekyc-message';
        }
        const submitBtn = document.getElementById('importerEkycSubmitBtn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit eKYC';
        }
    }

    function populateImporterEKYCForm() {
        const isIndia = importerUserCountry && importerUserCountry.toLowerCase() === 'india';

        const identitySelect = document.getElementById('importerIdentityProofType');
        if (identitySelect) {
            identitySelect.innerHTML = '<option value="">Select ID Proof</option>';
            const options = isIndia ? INDIAN_ID_PROOFS : INTERNATIONAL_ID_PROOFS;
            options.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = option.label;
                identitySelect.appendChild(opt);
            });
        }

        const businessSelect = document.getElementById('importerBusinessProofType');
        if (businessSelect) {
            businessSelect.innerHTML = '<option value="">Select Business Proof</option>';
            const options = isIndia ? INDIAN_BUSINESS_PROOFS : INTERNATIONAL_BUSINESS_PROOFS;
            options.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = option.label;
                businessSelect.appendChild(opt);
            });
        }

        const bankSelect = document.getElementById('importerBankProofType');
        if (bankSelect) {
            bankSelect.innerHTML = '<option value="">Select Bank Proof</option>';
            const options = isIndia ? INDIAN_BANK_PROOFS : INTERNATIONAL_BANK_PROOFS;
            options.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = option.label;
                bankSelect.appendChild(opt);
            });
        }
    }

    function prefillImporterEKYCForm() {
        if (!importerEkycData) return;
        if (importerEkycData.selectedIdentityProof) {
            const select = document.getElementById('importerIdentityProofType');
            if (select) {
                select.value = importerEkycData.selectedIdentityProof;
                select.disabled = true;
            }
        }
        if (importerEkycData.selectedBusinessProof) {
            const select = document.getElementById('importerBusinessProofType');
            if (select) {
                select.value = importerEkycData.selectedBusinessProof;
                select.disabled = true;
            }
        }
        if (importerEkycData.selectedBankProof) {
            const select = document.getElementById('importerBankProofType');
            if (select) {
                select.value = importerEkycData.selectedBankProof;
                select.disabled = true;
            }
        }
    }

    async function startImporterCamera() {
        try {
            const video = document.getElementById('importerCameraVideo');
            const previewContainer = document.getElementById('importerCameraPreviewContainer');
            const startBtn = document.getElementById('importerStartCameraBtn');
            const captureBtn = document.getElementById('importerCaptureBtn');
            const cancelBtn = document.getElementById('importerCancelCameraBtn');

            importerCameraStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            video.srcObject = importerCameraStream;
            previewContainer.style.display = 'block';
            startBtn.style.display = 'none';
            captureBtn.style.display = 'inline-block';
            cancelBtn.style.display = 'inline-block';
        } catch (error) {
            console.error('Error accessing camera:', error);
            showImporterEKYCMessage('Unable to access camera. Please check permissions.', 'error');
        }
    }

    function captureImporterSelfie() {
        const video = document.getElementById('importerCameraVideo');
        const canvas = document.getElementById('importerCameraCanvas');
        const preview = document.getElementById('importerSelfiePreview');
        const selfieInput = document.getElementById('importerSelfieFile');

        if (!video || !canvas || !importerCameraStream) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageUrl = canvas.toDataURL('image/jpeg', 0.9);
        importerSelfieDataUrl = imageUrl;

        preview.innerHTML = `
            <div style="margin-top: 8px;">
                <img src="${imageUrl}" alt="Selfie" style="max-width: 200px; max-height: 200px; border-radius: 4px; border: 1px solid var(--color-border);" />
                <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">Selfie captured</div>
            </div>
        `;

        if (selfieInput) {
            selfieInput.value = 'captured';
            selfieInput.setAttribute('data-valid', 'true');
        }
        stopImporterCamera();
        showImporterEKYCMessage('Selfie captured successfully', 'success');
    }

    function stopImporterCamera() {
        if (importerCameraStream) {
            importerCameraStream.getTracks().forEach(track => track.stop());
            importerCameraStream = null;
        }
        const video = document.getElementById('importerCameraVideo');
        const previewContainer = document.getElementById('importerCameraPreviewContainer');
        const startBtn = document.getElementById('importerStartCameraBtn');
        const captureBtn = document.getElementById('importerCaptureBtn');
        const cancelBtn = document.getElementById('importerCancelCameraBtn');
        if (video) video.srcObject = null;
        if (previewContainer) previewContainer.style.display = 'none';
        if (startBtn) startBtn.style.display = 'inline-block';
        if (captureBtn) captureBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    function handleImporterFilePreview(event, type) {
        const file = event.target.files[0];
        if (!file) return;
        const preview = document.getElementById(`${type}Preview`);
        if (!preview) return;
        if (file.size > 10 * 1024 * 1024) {
            showImporterEKYCMessage(`${type} file size should be less than 10MB`, 'error');
            event.target.value = '';
            preview.innerHTML = '';
            return;
        }
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `
                    <div style="margin-top: 8px;">
                        <img src="${e.target.result}" alt="${type}" style="max-width: 200px; max-height: 200px; border-radius: 4px; border: 1px solid var(--color-border);" />
                        <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">${file.name}</div>
                    </div>
                `;
            };
            reader.readAsDataURL(file);
        } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `
                    <div style="margin-top: 8px;">
                        <div style="border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; height: 200px;">
                            <iframe src="${e.target.result}" type="application/pdf" style="width: 100%; height: 100%; border: none;" title="${file.name}"></iframe>
                        </div>
                        <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">${file.name}</div>
                        <a href="${e.target.result}" download="${file.name}" style="font-size: 12px; color: var(--color-primary); text-decoration: none;">Download PDF</a>
                    </div>
                `;
            };
            reader.readAsDataURL(file);
        } else {
            preview.innerHTML = `
                <div style="margin-top: 8px;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" style="margin-bottom: 8px;">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <div style="font-size: 12px; color: var(--color-text-secondary);">${file.name}</div>
                </div>
            `;
        }
    }

    function clearImporterFilePreviews() {
        const previews = ['importerIdentityProofPreview', 'importerBusinessProofPreview', 'importerBankProofPreview', 'importerSelfiePreview'];
        previews.forEach(id => {
            const preview = document.getElementById(id);
            if (preview) preview.innerHTML = '';
        });
    }

    function handleImporterIdentityProofChange() {
        // Additional validation if needed
    }

    async function submitImporterEKYC(event) {
        event.preventDefault();
        if (!currentUser || !importerDatabase) {
            showImporterEKYCMessage('Not connected to Firebase.', 'error');
            return;
        }

        try {
            const ekycRef = importerDatabase.ref(`${currentUserBasePath}/ekyc`);
            const snapshot = await ekycRef.once('value');
            if (snapshot.exists() && snapshot.val().ekycCompleted === true) {
                showImporterEKYCMessage('You have already completed your eKYC', 'error');
                return;
            }
        } catch (error) {
            console.error('Error checking eKYC status:', error);
        }

        const submitBtn = document.getElementById('importerEkycSubmitBtn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';
        }

        try {
            const identityProofType = document.getElementById('importerIdentityProofType').value;
            const businessProofType = document.getElementById('importerBusinessProofType').value;
            const bankProofType = document.getElementById('importerBankProofType').value;
            const identityProofFile = document.getElementById('importerIdentityProofFile').files[0];
            const businessProofFile = document.getElementById('importerBusinessProofFile').files[0];
            const bankProofFile = document.getElementById('importerBankProofFile').files[0];

            if (!identityProofFile || !businessProofFile || !bankProofFile) {
                showImporterEKYCMessage('Please upload all required documents', 'error');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Submit eKYC';
                }
                return;
            }

            if (!importerSelfieDataUrl) {
                showImporterEKYCMessage('Please capture a live selfie before submitting', 'error');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Submit eKYC';
                }
                return;
            }

            showImporterEKYCMessage('Processing documents...', 'info');

            const [identityBase64, businessBase64, bankBase64] = await Promise.all([
                fileToBase64(identityProofFile),
                fileToBase64(businessProofFile),
                fileToBase64(bankProofFile)
            ]);

            const timestampIso = new Date().toISOString();
            const documentsPayload = {
                identityProof: {
                    dataUrl: identityBase64,
                    fileName: identityProofFile.name,
                    fileType: identityProofFile.type,
                    uploadedAt: timestampIso
                },
                businessProof: {
                    dataUrl: businessBase64,
                    fileName: businessProofFile.name,
                    fileType: businessProofFile.type,
                    uploadedAt: timestampIso
                },
                bankProof: {
                    dataUrl: bankBase64,
                    fileName: bankProofFile.name,
                    fileType: bankProofFile.type,
                    uploadedAt: timestampIso
                },
                selfie: {
                    dataUrl: importerSelfieDataUrl,
                    fileName: `selfie-${Date.now()}.jpg`,
                    fileType: 'image/jpeg',
                    uploadedAt: timestampIso
                }
            };

            const ekycData = {
                ekycStatus: 'pending',
                ekycCompleted: true,
                selectedIdentityProof: identityProofType,
                selectedBusinessProof: businessProofType,
                selectedBankProof: bankProofType,
                country: importerUserCountry || 'India',
                userName: document.getElementById('importerFullName')?.value?.trim() || currentUser.displayName || '',
                userEmail: currentUser.email,
                documents: documentsPayload,
                timestamp: timestampIso,
                updatedAt: timestampIso
            };

            await importerDatabase.ref(`${currentUserBasePath}/ekyc`).set(ekycData).catch(error => {
                console.error('Error saving eKYC data:', error);
                if (error.code === 'PERMISSION_DENIED' || error.code === 'permission_denied') {
                    showImporterEKYCMessage('Permission denied. Please configure Firebase security rules to allow authenticated users to write their own data.', 'error');
                } else {
                    showImporterEKYCMessage('Failed to submit eKYC. Please try again.', 'error');
                }
                throw error;
            });

            showImporterEKYCMessage('Your eKYC has been submitted successfully. You can now request a video call for verification.', 'success');

            setTimeout(() => {
                closeImporterEKYCModal();
                checkImporterEKYCStatus();
                const videoCallRequestCard = document.getElementById('importerVideoCallRequestCard');
                if (videoCallRequestCard) {
                    videoCallRequestCard.style.display = 'block';
                }
            }, 2000);

        } catch (error) {
            console.error('Error submitting eKYC:', error);
            showImporterEKYCMessage('Failed to submit eKYC. Please try again.', 'error');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit eKYC';
            }
        }
    }

    function showImporterEKYCMessage(message, type = 'success') {
        const messageEl = document.getElementById('importerEkycMessage');
        if (!messageEl) return;
        messageEl.textContent = message;
        messageEl.className = `ekyc-message ${type} show`;
        if (type !== 'error') {
            setTimeout(() => {
                messageEl.classList.remove('show');
            }, 5000);
        }
    }

    async function requestImporterVideoCall() {
        if (!currentUser || !importerDatabase) {
            showToast('Not connected to Firebase.');
            return;
        }

        if (!importerEkycData || importerEkycData.ekycCompleted !== true) {
            showToast('Please complete eKYC submission first');
            return;
        }

        if (importerEkycData.ekycStatus === 'verified') {
            showToast('Your eKYC is already verified!');
            return;
        }

        const modal = document.getElementById('importerVideoCallModal');
        if (modal) {
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            document.getElementById('importerWaitingForAgent').style.display = 'block';
            document.getElementById('importerVideoCallInterface').style.display = 'none';
            document.getElementById('importerCallEnded').style.display = 'none';
        }

        try {
            const requestData = {
                userId: currentUser.uid,
                userEmail: currentUser.email,
                userName: currentUser.displayName || currentUser.email.split('@')[0],
                ekycId: currentUser.uid,
                status: 'pending',
                ekycStatus: 'pending_verification',
                timestamp: Date.now(),
                createdAt: new Date().toISOString()
            };

            const requestRef = importerDatabase.ref(`${currentUserBasePath}/videoCallRequests`).push(requestData);
            importerVideoCallRequestId = requestRef.key;
            showToast('Request sent to admin. Waiting for response...');
            listenForImporterAgentAcceptance(importerVideoCallRequestId);
        } catch (error) {
            console.error('Error requesting video call:', error);
            showToast('Failed to request video call. Please try again.');
            closeImporterVideoCallModal();
        }
    }

    function listenForImporterAgentAcceptance(requestId) {
        if (!importerDatabase) return;
        const requestRef = importerDatabase.ref(`${currentUserBasePath}/videoCallRequests/${requestId}`);
        requestRef.on('value', snapshot => {
            if (!snapshot.exists()) return;
            const data = snapshot.val();
            if (data.status === 'accepted' && data.agentId) {
                showToast('Agent connected! Starting video call...');
                startImporterVideoCall(data.agentId, requestId);
            } else if (data.status === 'rejected') {
                closeImporterVideoCallModal();
                showToast('Your verification request was rejected. Please try again later.');
            } else if (data.status === 'completed') {
                if (data.ekycStatus === 'verified') {
                    showToast('Your eKYC has been verified! Closing video call...');
                    setTimeout(() => {
                        closeImporterVideoCallModal();
                        checkImporterEKYCStatus();
                    }, 2000);
                } else if (data.ekycStatus === 'rejected') {
                    closeImporterVideoCallModal();
                    showToast('Your eKYC was rejected. Reason: ' + (data.rejectionReason || 'Not provided'));
                    setTimeout(() => {
                        checkImporterEKYCStatus();
                    }, 1000);
                }
            }
        });
    }

    async function startImporterVideoCall(agentId, requestId) {
        try {
            document.getElementById('importerWaitingForAgent').style.display = 'none';
            document.getElementById('importerVideoCallInterface').style.display = 'block';

            importerLocalStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            const localVideo = document.getElementById('importerLocalVideo');
            if (localVideo) {
                localVideo.srcObject = importerLocalStream;
            }

            importerPeerConnection = new RTCPeerConnection(importerRtcConfiguration);

            importerLocalStream.getTracks().forEach(track => {
                importerPeerConnection.addTrack(track, importerLocalStream);
            });

            importerPeerConnection.ontrack = (event) => {
                const remoteVideo = document.getElementById('importerRemoteVideo');
                if (remoteVideo) {
                    importerRemoteStream = event.streams[0];
                    remoteVideo.srcObject = importerRemoteStream;
                }
            };

            importerPeerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    const candidateData = {
                        candidate: event.candidate.candidate,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                        sdpMid: event.candidate.sdpMid,
                        usernameFragment: event.candidate.usernameFragment
                    };
                    importerDatabase.ref(`${currentUserBasePath}/videoCallRequests/${requestId}`).update({
                        userIceCandidate: candidateData,
                        updatedAt: new Date().toISOString()
                    });
                }
            };

            const offer = await importerPeerConnection.createOffer();
            await importerPeerConnection.setLocalDescription(offer);

            await importerDatabase.ref(`${currentUserBasePath}/videoCallRequests/${requestId}`).update({
                offer: offer,
                status: 'connecting'
            });

            // Listen for answer from admin
            const requestRef = importerDatabase.ref(`${currentUserBasePath}/videoCallRequests/${requestId}`);
            requestRef.on('value', async (snapshot) => {
                if (!snapshot.exists()) return;
                const data = snapshot.val();
                
                // Process answer
                if (data.answer && importerPeerConnection && importerPeerConnection.signalingState === 'have-local-offer') {
                    try {
                        await importerPeerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                        console.log('Answer received and set');
                    } catch (error) {
                        console.error('Error setting remote description:', error);
                    }
                }
                
                // Process ICE candidates from admin
                if (data.agentIceCandidate && importerPeerConnection) {
                    try {
                        await importerPeerConnection.addIceCandidate(new RTCIceCandidate(data.agentIceCandidate));
                    } catch (error) {
                        console.error('Error adding ICE candidate:', error);
                    }
                }
            });

        } catch (error) {
            console.error('Error starting video call:', error);
            showToast('Failed to start video call. Please try again.');
        }
    }

    function toggleImporterMute() {
        if (importerLocalStream) {
            const audioTracks = importerLocalStream.getAudioTracks();
            audioTracks.forEach(track => {
                track.enabled = !track.enabled;
            });
            const btn = document.getElementById('importerMuteBtn');
            if (btn) {
                btn.classList.toggle('muted', !audioTracks[0].enabled);
            }
        }
    }

    function toggleImporterVideo() {
        if (importerLocalStream) {
            const videoTracks = importerLocalStream.getVideoTracks();
            videoTracks.forEach(track => {
                track.enabled = !track.enabled;
            });
            const btn = document.getElementById('importerVideoBtn');
            if (btn) {
                btn.classList.toggle('disabled', !videoTracks[0].enabled);
            }
        }
    }

    function endImporterVideoCall() {
        if (importerLocalStream) {
            importerLocalStream.getTracks().forEach(track => track.stop());
            importerLocalStream = null;
        }
        if (importerPeerConnection) {
            importerPeerConnection.close();
            importerPeerConnection = null;
        }
        document.getElementById('importerVideoCallInterface').style.display = 'none';
        document.getElementById('importerCallEnded').style.display = 'block';
    }

    function closeImporterVideoCallModal() {
        const modal = document.getElementById('importerVideoCallModal');
        if (!modal) return;
        endImporterVideoCall();
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        if (importerVideoCallListener && importerDatabase) {
            const requestRef = importerDatabase.ref(`${currentUserBasePath}/videoCallRequests/${importerVideoCallRequestId}`);
            requestRef.off('value', importerVideoCallListener);
            importerVideoCallListener = null;
        }
    }

    // Make eKYC functions globally available
    window.handleImporterEKYCButtonClick = handleImporterEKYCButtonClick;
    window.openImporterEKYCModal = openImporterEKYCModal;
    window.closeImporterEKYCModal = closeImporterEKYCModal;
    window.submitImporterEKYC = submitImporterEKYC;
    window.startImporterCamera = startImporterCamera;
    window.captureImporterSelfie = captureImporterSelfie;
    window.stopImporterCamera = stopImporterCamera;
    window.handleImporterFilePreview = handleImporterFilePreview;
    window.handleImporterIdentityProofChange = handleImporterIdentityProofChange;
    window.requestImporterVideoCall = requestImporterVideoCall;
    window.toggleImporterMute = toggleImporterMute;
    window.toggleImporterVideo = toggleImporterVideo;
    window.endImporterVideoCall = endImporterVideoCall;
    window.closeImporterVideoCallModal = closeImporterVideoCallModal;

    // Close eKYC modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('importerEkycModal');
            if (modal && modal.classList.contains('active')) {
                closeImporterEKYCModal();
            }
            const videoModal = document.getElementById('importerVideoCallModal');
            if (videoModal && videoModal.classList.contains('active')) {
                closeImporterVideoCallModal();
            }
        }
    });

    // ============================================
    // PROFILE MODAL FUNCTIONS
    // ============================================

    function openImporterProfileModal() {
        const modal = document.getElementById('importerProfileModal');
        if (!modal) return;
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        loadImporterProfileData();
    }

    function closeImporterProfileModal() {
        const modal = document.getElementById('importerProfileModal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    function switchImporterProfileTab(sectionName) {
        const sections = document.querySelectorAll('#importerProfileModal .profile-section');
        sections.forEach(section => section.classList.remove('active'));
        const targetSection = document.getElementById(`${sectionName}Section`);
        if (targetSection) targetSection.classList.add('active');

        const tabs = document.querySelectorAll('#importerProfileModal .profile-tab');
        tabs.forEach(tab => {
            tab.classList.remove('active');
            if (tab.getAttribute('data-section') === sectionName) {
                tab.classList.add('active');
            }
        });
    }

    function loadImporterProfileData() {
        if (!currentUser || !importerDatabase) return;
        const profileRef = importerDatabase.ref(`${currentUserBasePath}/profile`);
        profileRef.once('value', snapshot => {
            const data = snapshot.val() || {};
            if (data.basic) {
                document.getElementById('importerFullName').value = data.basic.fullName || '';
                document.getElementById('importerEmail').value = currentUser.email || '';
                document.getElementById('importerPhoneNumber').value = data.basic.phoneNumber || '';
                document.getElementById('importerAlternatePhone').value = data.basic.alternatePhone || '';
                if (data.basic.profilePhoto) {
                    const img = document.getElementById('importerPhotoPreviewImg');
                    img.src = data.basic.profilePhoto;
                    img.style.display = 'block';
                    document.getElementById('importerPhotoPreviewText').style.display = 'none';
                }
            }
            if (data.business) {
                document.getElementById('importerCompanyName').value = data.business.companyName || '';
                document.getElementById('importerBusinessType').value = data.business.businessType || '';
                document.getElementById('importerYearEstablished').value = data.business.yearEstablished || '';
                document.getElementById('importerBusinessCategory').value = data.business.businessCategory || '';
                document.getElementById('importerCompanyWebsite').value = data.business.companyWebsite || '';
                document.getElementById('importerCompanyDescription').value = data.business.companyDescription || '';
            }
            if (data.compliance) {
                document.getElementById('importerIecNumber').value = data.compliance.iecNumber || '';
                document.getElementById('importerGstNumber').value = data.compliance.gstNumber || '';
                document.getElementById('importerPanNumber').value = data.compliance.panNumber || '';
                document.getElementById('importerCinNumber').value = data.compliance.cinNumber || '';
                document.getElementById('importerDgftRegion').value = data.compliance.dgftRegion || '';
            }
            if (data.import) {
                document.getElementById('importerPrimaryProduct').value = data.import.primaryProduct || '';
                document.getElementById('importerProductCategory').value = data.import.productCategory || '';
                document.getElementById('importerHsCode').value = data.import.hsCode || '';
                document.getElementById('importerMonthlyVolume').value = data.import.monthlyVolume || '';
                document.getElementById('importerShippingMethod').value = data.import.shippingMethod || '';
            }
            if (data.address) {
                document.getElementById('importerBusinessAddress').value = data.address.businessAddress || '';
                document.getElementById('importerCity').value = data.address.city || '';
                document.getElementById('importerState').value = data.address.state || '';
                document.getElementById('importerCountry').value = data.address.country || '';
                document.getElementById('importerPincode').value = data.address.pincode || '';
            }
            if (data.banking) {
                document.getElementById('importerBankName').value = data.banking.bankName || '';
                document.getElementById('importerAccountHolderName').value = data.banking.accountHolderName || '';
                document.getElementById('importerAccountNumber').value = data.banking.accountNumber || '';
                document.getElementById('importerIfscCode').value = data.banking.ifscCode || '';
                document.getElementById('importerPaymentMethod').value = data.banking.paymentMethod || '';
            }
        }).catch(error => {
            console.error('Error loading profile data:', error);
            // Permission errors are expected if rules aren't set up yet
            if (error.code === 'PERMISSION_DENIED' || error.code === 'permission_denied') {
                console.warn('Permission denied. Please configure Firebase security rules.');
            }
        });
    }

    function saveImporterBasicInfo(event) {
        event.preventDefault();
        if (!currentUser || !importerDatabase) {
            showToast('Not connected to Firebase.');
            return;
        }
        const form = event.target;
        const data = {
            fullName: form.fullName.value,
            phoneNumber: form.phoneNumber.value,
            alternatePhone: form.alternatePhone.value,
            updatedAt: Date.now()
        };
        importerDatabase.ref(`${currentUserBasePath}/profile/basic`).update(data)
            .then(() => showToast('Basic information saved successfully.'))
            .catch(error => {
                console.error('Error saving basic info:', error);
                if (error.code === 'PERMISSION_DENIED' || error.code === 'permission_denied') {
                    showToast('Permission denied. Please configure Firebase security rules.');
                } else {
                    showToast('Failed to save basic information.');
                }
            });
    }

    function saveImporterBusinessInfo(event) {
        event.preventDefault();
        if (!currentUser || !importerDatabase) {
            showToast('Not connected to Firebase.');
            return;
        }
        const form = event.target;
        const data = {
            companyName: form.companyName.value,
            businessType: form.businessType.value,
            yearEstablished: form.yearEstablished.value,
            businessCategory: form.businessCategory.value,
            companyWebsite: form.companyWebsite.value,
            companyDescription: form.companyDescription.value,
            updatedAt: Date.now()
        };
        importerDatabase.ref(`${currentUserBasePath}/profile/business`).update(data)
            .then(() => showToast('Business information saved successfully.'))
            .catch(error => {
                console.error('Error saving business info:', error);
                if (error.code === 'PERMISSION_DENIED' || error.code === 'permission_denied') {
                    showToast('Permission denied. Please configure Firebase security rules.');
                } else {
                    showToast('Failed to save business information.');
                }
            });
    }

    function saveImporterComplianceInfo(event) {
        event.preventDefault();
        if (!currentUser || !importerDatabase) {
            showToast('Not connected to Firebase.');
            return;
        }
        const form = event.target;
        const data = {
            iecNumber: form.iecNumber.value,
            gstNumber: form.gstNumber.value,
            panNumber: form.panNumber.value,
            cinNumber: form.cinNumber.value,
            dgftRegion: form.dgftRegion.value,
            updatedAt: Date.now()
        };
        importerDatabase.ref(`${currentUserBasePath}/profile/compliance`).update(data)
            .then(() => showToast('Compliance information saved successfully.'))
            .catch(error => {
                console.error('Error saving compliance info:', error);
                if (error.code === 'PERMISSION_DENIED' || error.code === 'permission_denied') {
                    showToast('Permission denied. Please configure Firebase security rules.');
                } else {
                    showToast('Failed to save compliance information.');
                }
            });
    }

    function saveImporterImportInfo(event) {
        event.preventDefault();
        if (!currentUser || !importerDatabase) {
            showToast('Not connected to Firebase.');
            return;
        }
        const form = event.target;
        const selectedCountries = Array.from(form.sourceCountries.selectedOptions).map(opt => opt.value);
        const data = {
            primaryProduct: form.primaryProduct.value,
            productCategory: form.productCategory.value,
            hsCode: form.hsCode.value,
            sourceCountries: selectedCountries,
            monthlyVolume: form.monthlyVolume.value,
            shippingMethod: form.shippingMethod.value,
            updatedAt: Date.now()
        };
        importerDatabase.ref(`${currentUserBasePath}/profile/import`).update(data)
            .then(() => showToast('Import information saved successfully.'))
            .catch(error => {
                console.error('Error saving import info:', error);
                if (error.code === 'PERMISSION_DENIED' || error.code === 'permission_denied') {
                    showToast('Permission denied. Please configure Firebase security rules.');
                } else {
                    showToast('Failed to save import information.');
                }
            });
    }

    function saveImporterAddressInfo(event) {
        event.preventDefault();
        if (!currentUser || !importerDatabase) {
            showToast('Not connected to Firebase.');
            return;
        }
        const form = event.target;
        const data = {
            businessAddress: form.businessAddress.value,
            city: form.city.value,
            state: form.state.value,
            country: form.country.value,
            pincode: form.pincode.value,
            updatedAt: Date.now()
        };
        importerDatabase.ref(`${currentUserBasePath}/profile/address`).update(data)
            .then(() => showToast('Address information saved successfully.'))
            .catch(error => {
                console.error('Error saving address info:', error);
                if (error.code === 'PERMISSION_DENIED' || error.code === 'permission_denied') {
                    showToast('Permission denied. Please configure Firebase security rules.');
                } else {
                    showToast('Failed to save address information.');
                }
            });
    }

    function saveImporterBankingInfo(event) {
        event.preventDefault();
        if (!currentUser || !importerDatabase) {
            showToast('Not connected to Firebase.');
            return;
        }
        const form = event.target;
        const data = {
            bankName: form.bankName.value,
            accountHolderName: form.accountHolderName.value,
            accountNumber: form.accountNumber.value,
            ifscCode: form.ifscCode.value,
            paymentMethod: form.paymentMethod.value,
            updatedAt: Date.now()
        };
        importerDatabase.ref(`${currentUserBasePath}/profile/banking`).update(data)
            .then(() => showToast('Banking information saved successfully.'))
            .catch(error => {
                console.error('Error saving banking info:', error);
                if (error.code === 'PERMISSION_DENIED' || error.code === 'permission_denied') {
                    showToast('Permission denied. Please configure Firebase security rules.');
                } else {
                    showToast('Failed to save banking information.');
                }
            });
    }

    function saveImporterDocumentsInfo(event) {
        event.preventDefault();
        showToast('Document upload functionality will be implemented with file storage.');
    }

    function saveImporterSettingsInfo(event) {
        event.preventDefault();
        if (!currentUser || !importerAuth) {
            showToast('Not connected to Firebase.');
            return;
        }
        const form = event.target;
        const newPassword = form.newPassword.value;
        const confirmPassword = form.confirmPassword.value;
        if (newPassword && newPassword !== confirmPassword) {
            showToast('New passwords do not match.');
            return;
        }
        if (newPassword) {
            currentUser.updatePassword(newPassword)
                .then(() => showToast('Password updated successfully.'))
                .catch(() => showToast('Failed to update password.'));
        }
        showToast('Settings saved successfully.');
    }

    function handleImporterPhotoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Validate file size (max 5MB for Base64)
        if (file.size > 5 * 1024 * 1024) {
            showToast('File size should be less than 5MB');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('importerPhotoPreviewImg');
            img.src = e.target.result;
            img.style.display = 'block';
            document.getElementById('importerPhotoPreviewText').style.display = 'none';
            if (currentUser && importerDatabase) {
                importerDatabase.ref(`${currentUserBasePath}/profile/basic/profilePhoto`).set(e.target.result)
                    .then(() => showToast('Profile photo uploaded successfully.'))
                    .catch(error => {
                        console.error('Error uploading profile photo:', error);
                        if (error.code === 'PERMISSION_DENIED' || error.code === 'permission_denied') {
                            showToast('Permission denied. Please configure Firebase security rules.');
                        } else {
                            showToast('Failed to upload profile photo.');
                        }
                    });
            }
        };
        reader.onerror = function() {
            showToast('Failed to read file.');
        };
        reader.readAsDataURL(file);
    }

    function handleImporterDocumentUpload(event, fieldId) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById(`${fieldId}Preview`);
            preview.innerHTML = `<small>${file.name} (${(file.size / 1024).toFixed(2)} KB)</small>`;
            showToast('Document uploaded. Click Save Documents to store.');
        };
        reader.readAsDataURL(file);
    }

    function handleImporterLogout() {
        if (!importerAuth) {
            window.location.href = '../index.html';
            return;
        }
        clearRealtimeBindings();
        importerAuth.signOut().then(() => {
            window.location.href = '../index.html';
        });
    }

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('importerProfileModal');
            if (modal && modal.classList.contains('active')) {
                closeImporterProfileModal();
            }
        }
    });

    // ============================================
    // DOCUMENTS MODULE
    // ============================================
    let importerDocumentsCache = [];
    let importerCurrentDocument = null;
    let importerDocumentRequirementsInitialized = false;

    const importerDocumentTypeMap = {
        'iecCertificate': { name: 'IEC Certificate', category: 'iec', icon: '📋' },
        'gstCertificate': { name: 'GST Certificate', category: 'gst', icon: '📋' },
        'companyRegistration': { name: 'Company Registration', category: 'company', icon: '🏢' },
        'ownerIdProof': { name: 'Owner ID Proof', category: 'idproof', icon: '🪪' },
        'addressProof': { name: 'Address Proof', category: 'addressproof', icon: '📮' },
        'profilePhoto': { name: 'Profile Photo', category: 'profile', icon: '👤' },
        'identityProof': { name: 'Identity Proof', category: 'idproof', icon: '🪪' },
        'businessProof': { name: 'Business Proof', category: 'company', icon: '🏢' },
        'bankProof': { name: 'Bank Proof', category: 'bankstatement', icon: '🏦' },
        'selfie': { name: 'Verification Selfie', category: 'other', icon: '🤳' },
    };

    const IMPORTER_DOCUMENT_MODES = ['sea', 'air', 'imports', 'exports'];

    const importerCountryDocumentMatrix = [
        {
            id: 'india',
            name: 'India',
            corridor: 'Nhava Sheva (JNPT), Mundra, Chennai, Delhi Airport',
            modes: ['sea', 'air', 'imports'],
            quickChecklist: [
                'Commercial Invoice with HS code, value, and terms (GST compliant).',
                'Packing List with detailed item-wise breakdown for customs examination.',
                'Bill of Entry (BOE) filed electronically via ICEGATE before cargo arrival.',
                'Bill of Lading (BOL) or Air Waybill (AWB) from carrier.',
                'Import License / Registration Certificate for restricted items (DGFT).',
                'Certificate of Origin if claiming preferential duty rates.',
                'Insurance Certificate covering shipment value.',
                'GST Registration Certificate (GSTIN) for importer.',
            ],
            requirements: [
                { document: 'Commercial Invoice', use: 'Customs valuation, duty calculation & GST compliance', issuer: 'Foreign Exporter / Supplier', linkLabel: 'ICEGATE Import Guidelines', linkUrl: 'https://icegate.gov.in' },
                { document: 'Packing List', use: 'Physical examination, cargo verification & load planning', issuer: 'Foreign Exporter / Supplier', linkLabel: 'CBIC Import Procedures', linkUrl: 'https://www.cbic.gov.in' },
                { document: 'Bill of Entry (BOE)', use: 'Primary import declaration & customs clearance at port', issuer: 'Indian Importer / Customs Broker via ICEGATE', linkLabel: 'ICEGATE Bill of Entry', linkUrl: 'https://icegate.gov.in' },
                { document: 'Bill of Lading / Air Waybill', use: 'Proof of shipment, cargo release & title transfer', issuer: 'Shipping Line / Airline / Freight Forwarder', linkLabel: 'Directorate General of Shipping', linkUrl: 'https://www.dgshipping.gov.in' },
                { document: 'Import License / Registration', use: 'Required for restricted/prohibited items per ITC-HS', issuer: 'DGFT / Competent Authority', linkLabel: 'DGFT Import Licensing', linkUrl: 'https://dgft.gov.in' },
                { document: 'Certificate of Origin', use: 'Preferential duty claims under FTAs (ASEAN, SAFTA, etc.)', issuer: 'Chamber of Commerce / Authorized Body in Exporting Country', linkLabel: 'DGFT e-COO', linkUrl: 'https://coo.dgft.gov.in' },
                { document: 'Insurance Certificate', use: 'Cargo insurance coverage during transit', issuer: 'Insurance Company', linkLabel: 'IRDA Insurance', linkUrl: 'https://www.irdai.gov.in' },
                { document: 'GST Registration (GSTIN)', use: 'GST compliance & input tax credit for importer', issuer: 'GST Department', linkLabel: 'GST Portal', linkUrl: 'https://www.gst.gov.in' },
            ],
        },
        {
            id: 'united-states',
            name: 'United States',
            corridor: 'Ports: New York/New Jersey, Los Angeles/Long Beach, Savannah, Houston',
            modes: ['sea', 'air', 'imports'],
            quickChecklist: [
                'Commercial Invoice with detailed product description, HS code, and value.',
                'Packing List showing contents, weights, and dimensions.',
                'Bill of Lading (BOL) or Air Waybill (AWB) from carrier.',
                'Importer Security Filing (ISF 10+2) for ocean shipments (24 hours before loading).',
                'CBP Entry (Form 3461/7501) filed via customs broker in ACE system.',
                'IRS Number (EIN or SSN) for customs bond and duty payment.',
                'Customs Bond (Single Entry or Continuous) to guarantee duty payment.',
                'FDA/USDA/Partner Agency Certifications for regulated products.',
            ],
            requirements: [
                { document: 'Commercial Invoice', use: 'CBP customs entry, duty assessment & valuation', issuer: 'Foreign Exporter / Supplier', linkLabel: 'US CBP Import Requirements', linkUrl: 'https://www.cbp.gov/trade/basic-import-export' },
                { document: 'Packing List', use: 'CBP inspection, cargo examination & deconsolidation', issuer: 'Foreign Exporter / Supplier', linkLabel: 'CBP Trade Documentation', linkUrl: 'https://www.cbp.gov/trade' },
                { document: 'Bill of Lading / Air Waybill', use: 'Arrival notice, cargo release & delivery order', issuer: 'Carrier / NVOCC / Airline', linkLabel: 'Federal Maritime Commission', linkUrl: 'https://www.fmc.gov' },
                { document: 'Importer Security Filing (ISF 10+2)', use: 'Mandatory security filing for ocean cargo (24hrs before loading)', issuer: 'US Importer / Customs Broker', linkLabel: 'CBP ISF 10+2 Requirements', linkUrl: 'https://www.cbp.gov/border-security/ports-entry/cargo-security/importer-security-filing-102' },
                { document: 'CBP Entry (Form 3461/7501)', use: 'Formal import clearance & duty payment via ACE', issuer: 'US Customs Broker / Importer', linkLabel: 'CBP ACE System', linkUrl: 'https://www.cbp.gov/trade/automated' },
                { document: 'IRS Number (EIN/SSN)', use: 'Customs bond requirement & duty payment identification', issuer: 'Internal Revenue Service (IRS)', linkLabel: 'IRS EIN Application', linkUrl: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-ein' },
                { document: 'Customs Bond', use: 'Guarantee for duty payment & compliance (Single/Continuous)', issuer: 'Surety Company / Customs Broker', linkLabel: 'CBP Customs Bonds', linkUrl: 'https://www.cbp.gov/trade/finance/bonds' },
                { document: 'FDA/USDA/Partner Agency Docs', use: 'Regulatory clearance for food, drugs, agriculture, electronics', issuer: 'FDA / USDA / Relevant Agency', linkLabel: 'FDA Import Basics', linkUrl: 'https://www.fda.gov/industry/import-basics' },
            ],
        },
        {
            id: 'european-union',
            name: 'European Union',
            corridor: 'Ports: Rotterdam, Hamburg, Antwerp, Felixstowe, Le Havre',
            modes: ['sea', 'air', 'imports'],
            quickChecklist: [
                'Commercial Invoice & Packing List with detailed product information.',
                'Bill of Lading or Air Waybill from carrier.',
                'Entry Summary Declaration (ENS/ICS2) filed before arrival (24-48hrs).',
                'EU Single Administrative Document (SAD) for customs declaration.',
                'EORI Number (Economic Operators Registration) for EU importer.',
                'VAT Registration Number for VAT payment and recovery.',
                'Certificate of Origin / EUR.1 for preferential duty rates.',
                'Product-specific certificates (CE marking, health, phytosanitary).',
            ],
            requirements: [
                { document: 'Commercial Invoice & Packing List', use: 'Customs declaration base data, VAT calculation & duty assessment', issuer: 'Foreign Exporter / Supplier', linkLabel: 'EU Customs & Taxation', linkUrl: 'https://taxation-customs.ec.europa.eu' },
                { document: 'Bill of Lading / Air Waybill', use: 'Proof of shipment, cargo release at port & delivery order', issuer: 'Carrier / Freight Forwarder', linkLabel: 'Port of Rotterdam', linkUrl: 'https://www.portofrotterdam.com' },
                { document: 'Entry Summary Declaration (ENS/ICS2)', use: 'Pre-arrival security/safety filing (24-48hrs before arrival)', issuer: 'Carrier / Authorized Representative', linkLabel: 'ICS2 Security Filing', linkUrl: 'https://taxation-customs.ec.europa.eu/customs-4/customs-security/import-control-system-2-ics2_en' },
                { document: 'EU Customs Declaration (SAD)', use: 'Formal import clearance, duty payment & release into free circulation', issuer: 'EU Customs Broker / Importer', linkLabel: 'EU Customs Procedures', linkUrl: 'https://taxation-customs.ec.europa.eu/customs-4/customs-procedures_en' },
                { document: 'EORI Number', use: 'Economic Operators Registration for all EU customs transactions', issuer: 'EU Member State Customs Authority', linkLabel: 'EORI Registration', linkUrl: 'https://ec.europa.eu/taxation_customs/business/customs-procedures-import-and-export/customs-procedures/economic-operators-registration-identification-number-eori_en' },
                { document: 'VAT Registration Number', use: 'VAT payment on import & input tax credit recovery', issuer: 'EU Member State Tax Authority', linkLabel: 'EU VAT Information', linkUrl: 'https://ec.europa.eu/taxation_customs/business/vat_en' },
                { document: 'Certificate of Origin / EUR.1', use: 'Preferential duty rates under EU FTAs & GSP schemes', issuer: 'Chamber of Commerce / Competent Authority', linkLabel: 'EU Preferential Origin', linkUrl: 'https://taxation-customs.ec.europa.eu/customs-4/preferential-origins_en' },
                { document: 'Product Certificates (CE, Health, Phyto)', use: 'Compliance with EU product safety, health & phytosanitary standards', issuer: 'Competent Authorities / Testing Labs', linkLabel: 'EU Product Compliance', linkUrl: 'https://ec.europa.eu/growth/single-market/ce-marking_en' },
            ],
        },
        {
            id: 'united-kingdom',
            name: 'United Kingdom',
            corridor: 'Ports: Felixstowe, Southampton, London Gateway, Heathrow Airport',
            modes: ['sea', 'air', 'imports'],
            quickChecklist: [
                'Commercial Invoice & Packing List per UK customs requirements.',
                'Bill of Lading or Air Waybill for cargo release.',
                'UK Customs Declaration (CDS) filed via customs broker.',
                'EORI Number for UK importer (post-Brexit requirement).',
                'VAT Registration Number for VAT payment.',
                'Certificate of Origin if claiming preferential rates.',
                'Health/Phytosanitary certificates for regulated goods.',
            ],
            requirements: [
                { document: 'Commercial Invoice & Packing List', use: 'UK customs declaration data & HMRC assessment', issuer: 'Foreign Exporter / Supplier', linkLabel: 'HMRC Import Guidelines', linkUrl: 'https://www.gov.uk/guidance/filling-in-your-customs-declaration' },
                { document: 'Bill of Lading / Air Waybill', use: 'Cargo release & delivery order at UK port', issuer: 'Carrier / Freight Forwarder', linkLabel: 'UK Border Force', linkUrl: 'https://www.gov.uk/government/organisations/border-force' },
                { document: 'UK Customs Declaration (CDS)', use: 'Import clearance via Customs Declaration Service', issuer: 'UK Customs Broker / Importer', linkLabel: 'CDS Access', linkUrl: 'https://www.gov.uk/guidance/get-access-to-the-customs-declaration-service' },
                { document: 'EORI Number', use: 'Economic Operators Registration for UK customs', issuer: 'HMRC', linkLabel: 'EORI Registration UK', linkUrl: 'https://www.gov.uk/eori' },
                { document: 'VAT Registration', use: 'VAT payment on import & recovery', issuer: 'HMRC', linkLabel: 'UK VAT Registration', linkUrl: 'https://www.gov.uk/vat-registration' },
                { document: 'Certificate of Origin', use: 'Preferential duty under UK trade agreements', issuer: 'Chamber of Commerce', linkLabel: 'UK Trade Agreements', linkUrl: 'https://www.gov.uk/guidance/check-your-goods-meet-the-rules-of-origin' },
            ],
        },
        {
            id: 'canada',
            name: 'Canada',
            corridor: 'Ports: Vancouver, Prince Rupert, Montreal, Toronto Airport',
            modes: ['sea', 'air', 'imports'],
            quickChecklist: [
                'Commercial Invoice or Canada Customs Invoice (CBSA format).',
                'Packing List for CBSA inspection.',
                'Bill of Lading or Air Waybill.',
                'Customs Declaration (B3) filed via broker in CARM system.',
                'Business Number (BN) and Import/Export Account from CRA.',
                'CUSMA/Phytosanitary certificates when applicable.',
            ],
            requirements: [
                { document: 'Commercial Invoice / Canada Customs Invoice', use: 'CBSA import valuation & duty assessment', issuer: 'Foreign Exporter / Supplier', linkLabel: 'CBSA Importing', linkUrl: 'https://www.cbsa-asfc.gc.ca/import/menu-eng.html' },
                { document: 'Packing List', use: 'CBSA inspection & cargo examination', issuer: 'Foreign Exporter / Supplier', linkLabel: 'CBSA Programs', linkUrl: 'https://www.cbsa-asfc.gc.ca/prog/ccp-pcc/menu-eng.html' },
                { document: 'Bill of Lading / Air Waybill', use: 'Manifest & cargo release at Canadian port', issuer: 'Carrier', linkLabel: 'Port of Vancouver', linkUrl: 'https://www.portvancouver.com' },
                { document: 'Customs Declaration (B3)', use: 'Formal import clearance via CARM/CCS', issuer: 'Canadian Customs Broker / Importer', linkLabel: 'CBSA CARM', linkUrl: 'https://www.cbsa-asfc.gc.ca/prog/carm-gcra/menu-eng.html' },
                { document: 'Business Number (BN) & Import Account', use: 'CRA registration for duty payment & GST', issuer: 'Canada Revenue Agency (CRA)', linkLabel: 'CRA Business Number', linkUrl: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/registering-your-business/register.html' },
                { document: 'CUSMA / Phytosanitary Certificates', use: 'Preferential duty & CFIA clearance for regulated goods', issuer: 'CFIA / Authorized Bodies', linkLabel: 'CFIA Import Guidance', linkUrl: 'https://inspection.canada.ca' },
            ],
        },
        {
            id: 'australia',
            name: 'Australia',
            corridor: 'Ports: Sydney, Melbourne, Brisbane, Perth',
            modes: ['sea', 'air', 'imports'],
            quickChecklist: [
                'Commercial Invoice & Packing List (Australian Border Force format).',
                'Bill of Lading or Air Waybill.',
                'Import Declaration (N10/N20) via Integrated Cargo System (ICS).',
                'ABN (Australian Business Number) for importer.',
                'Biosecurity treatment or phytosanitary certificates (DAFF).',
            ],
            requirements: [
                { document: 'Commercial Invoice & Packing List', use: 'ABF import declaration & duty assessment', issuer: 'Foreign Exporter / Supplier', linkLabel: 'Australian Border Force', linkUrl: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/importing' },
                { document: 'Bill of Lading / Air Waybill', use: 'Manifest submission & delivery order', issuer: 'Carrier', linkLabel: 'Integrated Cargo System', linkUrl: 'https://www.abf.gov.au/help-and-support/ics' },
                { document: 'Import Declaration (ICS)', use: 'Formal entry (N10/N20) via ICS', issuer: 'Australian Customs Broker / Importer', linkLabel: 'ICS Lodgement', linkUrl: 'https://www.abf.gov.au/help-and-support/ics' },
                { document: 'ABN (Australian Business Number)', use: 'Business registration for GST & import clearance', issuer: 'Australian Taxation Office (ATO)', linkLabel: 'ABN Registration', linkUrl: 'https://www.abr.gov.au/business-super-funds/ applying-abn' },
                { document: 'Biosecurity Certificates', use: 'DAFF clearance for agriculture, food & plant products', issuer: 'Department of Agriculture / Competent Labs', linkLabel: 'DAFF Biosecurity', linkUrl: 'https://www.agriculture.gov.au/biosecurity-trade/import' },
            ],
        },
        {
            id: 'united-arab-emirates',
            name: 'United Arab Emirates',
            corridor: 'Ports: Jebel Ali, Khalifa Port, Dubai Airport, Abu Dhabi Airport',
            modes: ['sea', 'air', 'imports'],
            quickChecklist: [
                'Commercial Invoice & Packing List attested as per UAE customs.',
                'Bill of Lading / Air Waybill for manifest submission.',
                'Import/Export declarations lodged via Dubai Trade single window.',
                'Certificate of Origin via local chamber portals.',
                'Insurance Certificate covering shipment value.',
            ],
            requirements: [
                { document: 'Commercial Invoice & Packing List', use: 'UAE customs valuation & inspection', issuer: 'Foreign Exporter / Supplier', linkLabel: 'Dubai Customs', linkUrl: 'https://www.dubaicustoms.gov.ae' },
                { document: 'Bill of Lading / Air Waybill', use: 'Manifest filing & delivery order', issuer: 'Carrier', linkLabel: 'Dubai Trade', linkUrl: 'https://www.dubaitrade.ae' },
                { document: 'Import Declaration', use: 'Single window clearance via Dubai Trade', issuer: 'UAE Importer / Customs Broker', linkLabel: 'Dubai Trade Portal', linkUrl: 'https://www.dubaitrade.ae' },
                { document: 'Certificate of Origin', use: 'Destination compliance & duty preference', issuer: 'Dubai Chamber / Local Chambers', linkLabel: 'Dubai Chamber', linkUrl: 'https://www.dubaichamber.com' },
                { document: 'Insurance Certificate', use: 'Cargo insurance for transit coverage', issuer: 'Insurance Company', linkLabel: 'UAE Insurance Authority', linkUrl: 'https://www.ia.gov.ae' },
            ],
        },
        {
            id: 'china',
            name: 'China',
            corridor: 'Ports: Shanghai, Ningbo, Shenzhen, Beijing Airport',
            modes: ['sea', 'air', 'imports'],
            quickChecklist: [
                'Commercial Invoice & Packing List aligned with GACC requirements.',
                'Bill of Lading / Air Waybill for manifest & release.',
                'CIQ / GACC declarations for regulated goods.',
                'Import License / Registration for restricted items.',
                'Certificate of Origin for preferential duty.',
            ],
            requirements: [
                { document: 'Commercial Invoice & Packing List', use: 'GACC customs clearance & duty assessment', issuer: 'Foreign Exporter / Supplier', linkLabel: 'China Customs', linkUrl: 'https://english.customs.gov.cn' },
                { document: 'Bill of Lading / Air Waybill', use: 'Manifest submission & delivery order', issuer: 'Carrier', linkLabel: 'Port of Shanghai', linkUrl: 'https://www.portshanghai.com.cn/en' },
                { document: 'CIQ / GACC Declaration', use: 'Inspection & quarantine compliance', issuer: 'GACC / CIQ', linkLabel: 'GACC', linkUrl: 'https://www.gacc.gov.cn' },
                { document: 'Import License / Registration', use: 'Market access for regulated goods', issuer: 'MOFCOM / SAMR', linkLabel: 'MOFCOM Trade', linkUrl: 'http://english.mofcom.gov.cn' },
                { document: 'Certificate of Origin', use: 'Preferential duty under China FTAs', issuer: 'Chamber of Commerce', linkLabel: 'China FTA Network', linkUrl: 'http://fta.mofcom.gov.cn' },
            ],
        },
    ];

    function getImporterDocumentTypeInfo(docType, fallbackName = '') {
        return importerDocumentTypeMap[docType] || {
            name: fallbackName || docType,
            category: 'other',
            icon: '📄',
        };
    }

    function extractImporterBase64Components(dataInput = '', fallbackMime = '') {
        if (typeof dataInput !== 'string') {
            return { base64: '', mimeType: fallbackMime };
        }
        if (dataInput.startsWith('data:')) {
            const [meta, base64Payload] = dataInput.split(',');
            const mimeMatch = meta.match(/data:(.*?);base64/);
            return {
                base64: base64Payload || '',
                mimeType: mimeMatch ? mimeMatch[1] : (fallbackMime || ''),
            };
        }
        return { base64: dataInput, mimeType: fallbackMime || '' };
    }

    function getImporterMimeType(base64String) {
        if (!base64String) return 'unknown';
        if (base64String.startsWith('/9j/') || base64String.startsWith('iVBORw0KGgoAAAA')) {
            return 'image/jpeg';
        } else if (base64String.startsWith('iVBORw0KGgo')) {
            return 'image/png';
        } else if (base64String.startsWith('JVBERi0')) {
            return 'application/pdf';
        }
        return 'unknown';
    }

    function calculateImporterBase64Size(base64String) {
        if (!base64String) return 0;
        const padding = (base64String.match(/=/g) || []).length;
        const bytes = Math.ceil((base64String.length * 3) / 4) - padding;
        return (bytes / 1024).toFixed(2);
    }

    function resolveImporterUploadedAt(...values) {
        for (const value of values) {
            if (!value) continue;
            if (typeof value === 'string') return value;
            if (value instanceof Date) return value.toISOString();
            if (typeof value.toDate === 'function') {
                try {
                    return value.toDate().toISOString();
                } catch (error) {
                    console.warn('Unable to convert timestamp:', error);
                }
            }
        }
        return new Date().toISOString();
    }

    function createImporterDocumentRecord({
        source = 'realtime',
        docType,
        rawData,
        fileName = '',
        fileType = '',
        uploadedAt,
        fallbackName = '',
    }) {
        if (!rawData) return null;

        const { base64, mimeType: extractedMime } = extractImporterBase64Components(rawData, fileType);
        if (!base64) return null;

        const typeInfo = getImporterDocumentTypeInfo(docType, fallbackName);
        const resolvedMime = fileType || extractedMime || (getImporterMimeType(base64) !== 'unknown' ? getImporterMimeType(base64) : 'application/octet-stream');

        const record = {
            id: `${source}-${docType}-${uploadedAt || Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: docType,
            name: fileName || fallbackName || typeInfo.name,
            category: typeInfo.category,
            icon: typeInfo.icon,
            data: base64,
            uploadedAt: uploadedAt || new Date().toISOString(),
            size: calculateImporterBase64Size(base64),
            mimeType: resolvedMime,
            source,
            fileName: fileName || fallbackName || typeInfo.name,
        };

        return record;
    }

    function collectImporterRealtimeDocuments(userData = {}) {
        if (!userData.documents) return [];

        const documents = [];
        Object.keys(userData.documents).forEach((docKey) => {
            if (docKey.endsWith('FileName') || docKey.endsWith('FileType')) {
                return;
            }

            const rawValue = userData.documents[docKey];
            if (!rawValue) return;

            const normalizedValue = typeof rawValue === 'object' && rawValue.data ? rawValue.data : rawValue;
            const fileName =
                (typeof rawValue === 'object' && rawValue.fileName) ||
                userData.documents[`${docKey}FileName`] ||
                undefined;
            const fileType =
                (typeof rawValue === 'object' && rawValue.fileType) ||
                userData.documents[`${docKey}FileType`] ||
                undefined;
            const uploadedAt = resolveImporterUploadedAt(
                (typeof rawValue === 'object' && rawValue.uploadedAt) || userData[`${docKey}UpdatedAt`]
            );

            const record = createImporterDocumentRecord({
                source: 'realtime',
                docType: docKey,
                rawData: normalizedValue,
                fileName,
                fileType,
                uploadedAt,
            });

            if (record) {
                record.status = 'Uploaded';
                documents.push(record);
            }
        });

        return documents;
    }

    function collectImporterEKYCDocuments(ekycData = {}) {
        if (!ekycData.documents) return [];

        const documents = [];
        Object.entries(ekycData.documents).forEach(([docType, docValue]) => {
            if (!docValue) return;

            const rawData = docValue.dataUrl || docValue.base64 || docValue.data || '';
            const uploadedAt = resolveImporterUploadedAt(docValue.uploadedAt, ekycData.updatedAt, ekycData.timestamp);

            const record = createImporterDocumentRecord({
                source: 'realtime',
                docType,
                rawData,
                fileName: docValue.fileName,
                fileType: docValue.fileType,
                uploadedAt,
            });

            if (record) {
                record.status = (ekycData.ekycStatus || 'Submitted').toUpperCase();
                documents.push(record);
            }
        });

        return documents;
    }

    async function loadImporterDocumentsFromFirebase() {
        if (!currentUser || !importerDatabase) {
            console.log('User not authenticated or database not available');
            return;
        }

        const loadingEl = document.getElementById('importerDocumentsLoading');
        const emptyEl = document.getElementById('importerDocumentsEmpty');
        const gridEl = document.getElementById('importerDocumentsGrid');
        
        if (loadingEl) loadingEl.style.display = 'flex';
        if (gridEl) gridEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'none';

        try {
            const snapshot = await importerDatabase.ref(`${currentUserBasePath}`).once('value');
            const userData = snapshot.val() || {};

            const documents = [];
            
            if (userData.documents) {
                documents.push(...collectImporterRealtimeDocuments(userData));
            }

            if (userData.profilePhoto) {
                const profilePhotoData = typeof userData.profilePhoto === 'object' ? userData.profilePhoto.data : userData.profilePhoto;
                if (profilePhotoData) {
                    const record = createImporterDocumentRecord({
                        source: 'realtime',
                        docType: 'profilePhoto',
                        rawData: profilePhotoData,
                        fileName: (typeof userData.profilePhoto === 'object' && userData.profilePhoto.fileName) || 'Profile Photo',
                        fileType: (typeof userData.profilePhoto === 'object' && userData.profilePhoto.fileType) || '',
                        uploadedAt: resolveImporterUploadedAt(
                            userData.profilePhoto?.uploadedAt,
                            userData.profilePhotoUpdatedAt,
                            userData.updatedAt
                        ),
                    });

                    if (record) {
                        record.status = 'Uploaded';
                        documents.push(record);
                    }
                }
            }

            if (userData.ekyc && userData.ekyc.documents) {
                documents.push(...collectImporterEKYCDocuments(userData.ekyc));
            }

            importerDocumentsCache = documents;
            
            if (documents.length === 0) {
                showImporterEmptyDocuments();
            } else {
                renderImporterDocuments(documents);
                updateImporterDocumentsStats(documents);
            }
        } catch (error) {
            console.error('Error loading documents:', error);
            importerDocumentsCache = [];
            showImporterEmptyDocuments();
        } finally {
            if (loadingEl) loadingEl.style.display = 'none';
        }
    }

    function showImporterEmptyDocuments() {
        const emptyEl = document.getElementById('importerDocumentsEmpty');
        const gridEl = document.getElementById('importerDocumentsGrid');
        const statsEl = document.getElementById('importerDocumentsStats');
        
        if (emptyEl) emptyEl.style.display = 'flex';
        if (gridEl) gridEl.style.display = 'none';
        if (statsEl) statsEl.style.display = 'none';
    }

    function renderImporterDocuments(documents) {
        const gridEl = document.getElementById('importerDocumentsGrid');
        const emptyEl = document.getElementById('importerDocumentsEmpty');
        
        if (!gridEl) return;
        
        if (documents.length === 0) {
            showImporterEmptyDocuments();
            return;
        }

        gridEl.style.display = 'grid';
        if (emptyEl) emptyEl.style.display = 'none';

        gridEl.innerHTML = documents.map((doc) => {
            const uploadDate = new Date(doc.uploadedAt);
            const formattedDate = uploadDate.toLocaleDateString();
            const previewHTML = isImporterImageMimeType(doc.mimeType) && doc.data
                ? `<img src="data:${doc.mimeType};base64,${doc.data}" alt="${doc.name}">`
                : `<div class="file-icon">${doc.icon}</div>`;

            return `
                <div class="document-card" onclick="openImporterDocumentDetail('${doc.id}')">
                    <div class="document-card-preview">
                        ${previewHTML}
                        <div class="document-card-overlay">
                            <button onclick="event.stopPropagation(); openImporterDocumentDetail('${doc.id}')">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                                View
                            </button>
                            <button onclick="event.stopPropagation(); downloadImporterDocumentDirect('${doc.id}')">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                                Download
                            </button>
                        </div>
                    </div>
                    <div class="document-card-content">
                        <div class="document-card-title">${doc.name}</div>
                        <span class="document-card-type">${doc.category}</span>
                        <div class="document-card-meta">
                            <div class="document-card-date">
                                <div>${formattedDate}</div>
                            </div>
                            <div class="document-card-size">${doc.size} KB</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function isImporterImageMimeType(mimeType) {
        return mimeType && mimeType.startsWith('image/');
    }

    function updateImporterDocumentsStats(documents) {
        const statsEl = document.getElementById('importerDocumentsStats');
        if (!statsEl) return;

        const totalDocs = documents.length;
        const totalSize = documents.reduce((sum, doc) => sum + parseFloat(doc.size), 0).toFixed(2);
        const uniqueTypes = new Set(documents.map(doc => doc.category)).size;

        const totalDocsEl = document.getElementById('importerTotalDocuments');
        const totalSizeEl = document.getElementById('importerTotalSize');
        const typeCountEl = document.getElementById('importerTypeCount');

        if (totalDocsEl) totalDocsEl.textContent = totalDocs;
        if (totalSizeEl) totalSizeEl.textContent = `${(totalSize / 1024).toFixed(2)} MB`;
        if (typeCountEl) typeCountEl.textContent = uniqueTypes;

        if (totalDocs > 0) {
            statsEl.style.display = 'grid';
        }
    }

    function debounceImporter(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    function handleImporterDocumentSearch(event) {
        const searchTerm = event.target.value.toLowerCase();
        const filtered = importerDocumentsCache.filter(doc => 
            doc.name.toLowerCase().includes(searchTerm) ||
            doc.category.toLowerCase().includes(searchTerm)
        );
        renderImporterDocuments(filtered);
    }

    function handleImporterDocumentFilter(event) {
        const filterValue = event.target.value;
        
        if (!filterValue) {
            renderImporterDocuments(importerDocumentsCache);
        } else {
            const filtered = importerDocumentsCache.filter(doc => doc.category === filterValue);
            renderImporterDocuments(filtered);
        }
    }

    function openImporterDocumentDetail(docId) {
        const doc = importerDocumentsCache.find(d => d.id === docId);
        if (!doc) return;
        importerCurrentDocument = doc;
        alert(`Document: ${doc.name}\nType: ${doc.category}\nSize: ${doc.size} KB\n\nFull preview functionality can be added here.`);
    }

    function downloadImporterDocumentDirect(docId) {
        const doc = importerDocumentsCache.find(d => d.id === docId);
        if (!doc || !doc.data) return;

        const mimeType = doc.mimeType || 'application/octet-stream';
        const extension = mimeType.includes('pdf') ? 'pdf' : (mimeType.includes('png') ? 'png' : 'jpg');
        const blob = base64ToBlob(doc.data, mimeType);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${doc.fileName || doc.name}.${extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }

    function initializeImporterDocumentRequirementsSection() {
        if (importerDocumentRequirementsInitialized) return;

        const countrySelect = document.getElementById('importerDocCountrySelect');
        const modeSelect = document.getElementById('importerDocModeSelect');

        if (!countrySelect || !modeSelect) {
            return;
        }

        populateImporterDocumentCountryOptions(countrySelect);
        populateImporterDocumentModeOptions(modeSelect);

        countrySelect.addEventListener('change', () => {
            updateImporterDocumentRequirementsDisplay();
            resetImporterDocumentChecklistResult();
        });

        modeSelect.addEventListener('change', () => {
            updateImporterDocumentRequirementsDisplay();
            resetImporterDocumentChecklistResult();
        });

        updateImporterDocumentRequirementsDisplay();
        importerDocumentRequirementsInitialized = true;
    }

    function populateImporterDocumentCountryOptions(selectEl) {
        if (!selectEl) return;
        selectEl.innerHTML = importerCountryDocumentMatrix
            .map(country => `<option value="${country.id}">${country.name}</option>`)
            .join('');
    }

    function populateImporterDocumentModeOptions(selectEl) {
        if (!selectEl) return;
        const options = ['all', ...IMPORTER_DOCUMENT_MODES].map(mode => `<option value="${mode}">${formatImporterModeLabel(mode)}</option>`);
        selectEl.innerHTML = options.join('');
    }

    function formatImporterModeLabel(mode) {
        if (!mode || mode === 'all') return 'All Modes';
        const labels = {
            sea: 'Sea Freight',
            air: 'Air Freight',
            imports: 'Imports',
            exports: 'Exports',
        };
        return labels[mode] || mode.charAt(0).toUpperCase() + mode.slice(1);
    }

    function updateImporterDocumentRequirementsDisplay(presetCountryId, presetMode) {
        const countrySelect = document.getElementById('importerDocCountrySelect');
        const modeSelect = document.getElementById('importerDocModeSelect');
        const targetCountryId = presetCountryId || countrySelect?.value || importerCountryDocumentMatrix[0]?.id;
        const targetMode = presetMode || modeSelect?.value || 'all';

        if (countrySelect && targetCountryId) {
            countrySelect.value = targetCountryId;
        }
        if (modeSelect && targetMode) {
            modeSelect.value = targetMode;
        }

        const countryData = getImporterCountryDataById(targetCountryId);
        renderImporterDocumentRequirementsTable(countryData, targetMode);
    }

    function getImporterCountryDataById(countryId) {
        return importerCountryDocumentMatrix.find(country => country.id === countryId);
    }

    function renderImporterDocumentRequirementsTable(countryData, mode) {
        const container = document.getElementById('importerDocRequirementsTable');
        if (!container) return;

        if (!countryData) {
            container.innerHTML = `<div class="doc-empty-state">We couldn't find requirements for the selected country yet. Please choose another option.</div>`;
            return;
        }

        if (mode && mode !== 'all' && !countryData.modes.includes(mode)) {
            container.innerHTML = `<div class="doc-empty-state">We haven't mapped ${formatImporterModeLabel(mode)} requirements for ${countryData.name} yet. Try another mode.</div>`;
            return;
        }

        const rows = countryData.requirements.map(req => `
            <tr>
                <td>${req.document}</td>
                <td>${req.use}</td>
                <td>${req.issuer}</td>
                <td>
                    ${req.linkUrl ? `<a href="${req.linkUrl}" target="_blank" rel="noopener">${req.linkLabel || 'Official Link'}</a>` : '-'}
                </td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div class="doc-table-card">
                <div class="doc-table-card-head">
                    <div>
                        <h4>${countryData.name}</h4>
                        <p>${countryData.corridor || ''}</p>
                    </div>
                    <span class="doc-table-badge">${formatImporterModeLabel(mode)}</span>
                </div>
                <div class="doc-requirements-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Document</th>
                                <th>Typical Use</th>
                                <th>Issuer</th>
                                <th>Official Link</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function resetImporterDocumentChecklistResult() {
        const checklistEl = document.getElementById('importerDocChecklistResult');
        if (checklistEl) {
            checklistEl.classList.remove('active');
            checklistEl.textContent = '';
        }
    }

    function generateImporterDocumentChecklist() {
        const countrySelect = document.getElementById('importerDocCountrySelect');
        const modeSelect = document.getElementById('importerDocModeSelect');
        const checklistEl = document.getElementById('importerDocChecklistResult');

        if (!countrySelect || !modeSelect || !checklistEl) return;

        const countryData = getImporterCountryDataById(countrySelect.value);
        const selectedMode = modeSelect.value;

        if (!countryData) {
            checklistEl.innerHTML = 'Select a country to see the quick checklist.';
            checklistEl.classList.add('active');
            return;
        }

        if (selectedMode !== 'all' && !countryData.modes.includes(selectedMode)) {
            checklistEl.innerHTML = `We have not mapped ${formatImporterModeLabel(selectedMode)} workflows for ${countryData.name}. Try another mode.`;
            checklistEl.classList.add('active');
            return;
        }

        const items = countryData.quickChecklist || [];
        if (!items.length) {
            checklistEl.innerHTML = 'Checklist will be available soon.';
            checklistEl.classList.add('active');
            return;
        }

        const listHtml = items.map(item => `<li>${item}</li>`).join('');
        checklistEl.innerHTML = `
            <h4>Checklist for ${countryData.name} (${formatImporterModeLabel(selectedMode)})</h4>
            <ul>${listHtml}</ul>
            <p style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--color-text-tertiary);">
                Source: Official customs, trade and partner agency portals linked above.
            </p>
        `;
        checklistEl.classList.add('active');
    }

    function initializeImporterDocumentsModule() {
        const documentSearch = document.getElementById('importerDocumentSearch');
        const documentFilter = document.getElementById('importerDocumentFilter');
        
        if (documentSearch) {
            documentSearch.addEventListener('input', debounceImporter(handleImporterDocumentSearch, 300));
        }
        
        if (documentFilter) {
            documentFilter.addEventListener('change', handleImporterDocumentFilter);
        }

        initializeImporterDocumentRequirementsSection();
    }

    // Make functions globally available
    window.openImporterProfileModal = openImporterProfileModal;
    window.closeImporterProfileModal = closeImporterProfileModal;
    window.switchImporterProfileTab = switchImporterProfileTab;
    window.saveImporterBasicInfo = saveImporterBasicInfo;
    window.saveImporterBusinessInfo = saveImporterBusinessInfo;
    window.saveImporterComplianceInfo = saveImporterComplianceInfo;
    window.saveImporterImportInfo = saveImporterImportInfo;
    window.saveImporterAddressInfo = saveImporterAddressInfo;
    window.saveImporterBankingInfo = saveImporterBankingInfo;
    window.saveImporterDocumentsInfo = saveImporterDocumentsInfo;
    window.saveImporterSettingsInfo = saveImporterSettingsInfo;
    window.handleImporterPhotoUpload = handleImporterPhotoUpload;
    window.handleImporterDocumentUpload = handleImporterDocumentUpload;
    window.handleImporterLogout = handleImporterLogout;
    window.openImporterDocumentDetail = openImporterDocumentDetail;
    window.downloadImporterDocumentDirect = downloadImporterDocumentDirect;
    window.generateImporterDocumentChecklist = generateImporterDocumentChecklist;

    // ============================================
    // MARKETPLACE & CART MANAGEMENT
    // ============================================

    /**
     * Load products from exporter database
     */
    async function loadMarketplaceProducts() {
        if (!exporterDatabase) {
            console.error('Exporter database not initialized. Attempting to initialize...');
            // Try to initialize if not already done
            try {
                const existingExporter = firebase.apps.find(app => app.name === 'exporterApp');
                if (existingExporter) {
                    exporterApp = existingExporter;
                } else {
                    exporterApp = firebase.initializeApp(exporterFirebaseConfig, 'exporterApp');
                }
                exporterDatabase = exporterApp.database();
                console.log('Exporter database initialized on demand');
            } catch (error) {
                console.error('Failed to initialize exporter database:', error);
                const loadingEl = document.getElementById('marketplaceLoading');
                const emptyEl = document.getElementById('marketplaceEmpty');
                if (loadingEl) loadingEl.style.display = 'none';
                if (emptyEl) {
                    emptyEl.innerHTML = '<p style="color: #ef4444;">Failed to connect to marketplace. Please refresh the page.</p>';
                    emptyEl.style.display = 'block';
                }
                return;
            }
        }

        const loadingEl = document.getElementById('marketplaceLoading');
        const productsEl = document.getElementById('marketplaceProducts');
        const emptyEl = document.getElementById('marketplaceEmpty');

        if (loadingEl) loadingEl.style.display = 'block';
        if (productsEl) productsEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'none';

        try {
            const allProducts = [];

            // Method 1: Try to load from productCatalog (global catalog)
            try {
                const catalogSnapshot = await exporterDatabase.ref('productCatalog').once('value');
                const catalogData = catalogSnapshot.val() || {};
                
                Object.entries(catalogData).forEach(([productId, product]) => {
                    if (product && product.name && product.name.trim() !== '') {
                        // Normalize product data - ensure all required fields
                        // Handle both price/priceValue and currency/priceCurrency
                        const priceValue = parseFloat(product.priceValue) || parseFloat(product.price) || 0;
                        const priceCurrency = product.priceCurrency || product.currency || 'USD';
                        
                        const normalizedProduct = {
                            id: productId,
                            name: product.name.trim(),
                            description: product.description || '',
                            // Support both field names for compatibility
                            price: priceValue,
                            priceValue: priceValue,
                            currency: priceCurrency,
                            priceCurrency: priceCurrency,
                            stockQuantity: parseFloat(product.stockQuantity) || 
                                         parseFloat(product.stock) || 
                                         parseFloat(product.quantity) || 
                                         0,
                            status: product.status || 'published',
                            exporterId: product.userId || product.exporterId || '',
                            exporterName: product.exporterName || 'Unknown Exporter',
                            // Include additional product fields
                            category: product.category || '',
                            incoterm: product.incoterm || '',
                            hsCode: product.hsCode || '',
                            minOrderQty: product.minOrderQty || '',
                            leadTime: product.leadTime || '',
                            targetMarkets: product.targetMarkets || '',
                            specs: product.specs || '',
                            packagingDetails: product.packagingDetails || '',
                            certifications: product.certifications || '',
                            complianceNotes: product.complianceNotes || '',
                            productionCapacity: product.productionCapacity || '',
                            source: 'catalog',
                            ...product // Spread to include any additional fields
                        };
                        
                        // Override with normalized values
                        normalizedProduct.name = product.name.trim();
                        normalizedProduct.price = priceValue;
                        normalizedProduct.priceValue = priceValue;
                        normalizedProduct.currency = priceCurrency;
                        normalizedProduct.priceCurrency = priceCurrency;
                        normalizedProduct.stockQuantity = parseFloat(product.stockQuantity) || 
                                                         parseFloat(product.stock) || 
                                                         parseFloat(product.quantity) || 
                                                         0;
                        
                        // Handle image data - check if already a data URL
                        // Priority: imageBase64 > image
                        if (product.imageBase64) {
                            if (product.imageBase64.startsWith('data:')) {
                                // Already a complete data URL - use as is
                                normalizedProduct.imageBase64 = product.imageBase64;
                                // Extract mime type from data URL
                                const match = product.imageBase64.match(/^data:([^;]+);base64,/);
                                if (match) {
                                    normalizedProduct.imageFileType = match[1];
                                }
                            } else {
                                // Just base64 string without prefix
                                normalizedProduct.imageBase64 = product.imageBase64;
                            }
                        } else if (product.image) {
                            if (product.image.startsWith('data:')) {
                                // Already a complete data URL
                                normalizedProduct.imageBase64 = product.image;
                                // Extract mime type
                                const match = product.image.match(/^data:([^;]+);base64,/);
                                if (match) {
                                    normalizedProduct.imageFileType = match[1];
                                }
                            } else {
                                // Just base64 string
                                normalizedProduct.imageBase64 = product.image;
                            }
                        }
                        
                        // Set image file type if not already set
                        if (!normalizedProduct.imageFileType) {
                            if (product.imageFileType) {
                                normalizedProduct.imageFileType = product.imageFileType;
                            } else if (normalizedProduct.imageBase64 && !normalizedProduct.imageBase64.startsWith('data:')) {
                                normalizedProduct.imageFileType = 'image/jpeg'; // default for base64 strings
                            }
                        }
                        
                        // Only add if not draft (or status is not set)
                        if (normalizedProduct.status !== 'draft') {
                            allProducts.push(normalizedProduct);
                        } else {
                            console.log('Skipped draft product from catalog:', {
                                id: productId,
                                name: normalizedProduct.name,
                                status: normalizedProduct.status
                            });
                        }
                    } else {
                        console.log('Skipped product from catalog (missing name):', {
                            id: productId,
                            hasProduct: !!product,
                            hasName: !!(product && product.name),
                            product: product
                        });
                    }
                });
                console.log(`Loaded ${Object.keys(catalogData).length} products from productCatalog, added ${allProducts.length} valid products`);
            } catch (catalogError) {
                console.warn('Could not load from productCatalog:', catalogError);
            }

            // Method 2: Load products from users/{userId}/products
            try {
                const usersSnapshot = await exporterDatabase.ref('users').once('value');
                const usersData = usersSnapshot.val() || {};
                
                Object.entries(usersData).forEach(([userId, userData]) => {
                    if (userData && userData.products) {
                        const userProducts = userData.products;
                        
                        // Handle both array and object formats
                        const productsArray = Array.isArray(userProducts) 
                            ? userProducts.map((p, idx) => ({ id: idx.toString(), ...p }))
                            : Object.entries(userProducts).map(([productId, product]) => ({ id: productId, ...product }));
                        
                        productsArray.forEach(product => {
                            if (product && product.name && product.name.trim() !== '') {
                                // Normalize product data - ensure all required fields
                                // Handle both price/priceValue and currency/priceCurrency
                                const priceValue = parseFloat(product.priceValue) || parseFloat(product.price) || 0;
                                const priceCurrency = product.priceCurrency || product.currency || 'USD';
                                
                                const normalizedProduct = {
                                    id: product.id || '',
                                    name: product.name.trim(),
                                    description: product.description || '',
                                    // Support both field names for compatibility
                                    price: priceValue,
                                    priceValue: priceValue,
                                    currency: priceCurrency,
                                    priceCurrency: priceCurrency,
                                    stockQuantity: parseFloat(product.stockQuantity) || 
                                                 parseFloat(product.stock) || 
                                                 parseFloat(product.quantity) || 
                                                 0,
                                    status: product.status || 'published',
                                    exporterId: userId,
                                    exporterName: product.exporterName || 
                                                 userData.profile?.companyName || 
                                                 userData.profile?.fullName || 
                                                 userData.profile?.displayName || 
                                                 'Unknown Exporter',
                                    // Include additional product fields
                                    category: product.category || '',
                                    incoterm: product.incoterm || '',
                                    hsCode: product.hsCode || '',
                                    minOrderQty: product.minOrderQty || '',
                                    leadTime: product.leadTime || '',
                                    targetMarkets: product.targetMarkets || '',
                                    specs: product.specs || '',
                                    packagingDetails: product.packagingDetails || '',
                                    certifications: product.certifications || '',
                                    complianceNotes: product.complianceNotes || '',
                                    productionCapacity: product.productionCapacity || '',
                                    source: 'user',
                                    ...product // Spread to include any additional fields
                                };
                                
                                // Override with normalized values
                                normalizedProduct.name = product.name.trim();
                                normalizedProduct.price = priceValue;
                                normalizedProduct.priceValue = priceValue;
                                normalizedProduct.currency = priceCurrency;
                                normalizedProduct.priceCurrency = priceCurrency;
                                normalizedProduct.stockQuantity = parseFloat(product.stockQuantity) || 
                                                                 parseFloat(product.stock) || 
                                                                 parseFloat(product.quantity) || 
                                                                 0;
                                
                                // Handle image data - check if already a data URL
                                // Priority: imageBase64 > image
                                if (product.imageBase64) {
                                    if (product.imageBase64.startsWith('data:')) {
                                        // Already a complete data URL - use as is
                                        normalizedProduct.imageBase64 = product.imageBase64;
                                        // Extract mime type from data URL
                                        const match = product.imageBase64.match(/^data:([^;]+);base64,/);
                                        if (match) {
                                            normalizedProduct.imageFileType = match[1];
                                        }
                                    } else {
                                        // Just base64 string without prefix
                                        normalizedProduct.imageBase64 = product.imageBase64;
                                    }
                                } else if (product.image) {
                                    if (product.image.startsWith('data:')) {
                                        // Already a complete data URL
                                        normalizedProduct.imageBase64 = product.image;
                                        // Extract mime type
                                        const match = product.image.match(/^data:([^;]+);base64,/);
                                        if (match) {
                                            normalizedProduct.imageFileType = match[1];
                                        }
                                    } else {
                                        // Just base64 string
                                        normalizedProduct.imageBase64 = product.image;
                                    }
                                }
                                
                                // Set image file type if not already set
                                if (!normalizedProduct.imageFileType) {
                                    if (product.imageFileType) {
                                        normalizedProduct.imageFileType = product.imageFileType;
                                    } else if (product.imageFileName) {
                                        const ext = product.imageFileName.split('.').pop()?.toLowerCase();
                                        if (ext === 'jpg' || ext === 'jpeg') {
                                            normalizedProduct.imageFileType = 'image/jpeg';
                                        } else if (ext === 'png') {
                                            normalizedProduct.imageFileType = 'image/png';
                                        } else {
                                            normalizedProduct.imageFileType = 'image/jpeg';
                                        }
                                    } else if (normalizedProduct.imageBase64 && !normalizedProduct.imageBase64.startsWith('data:')) {
                                        normalizedProduct.imageFileType = 'image/jpeg'; // default for base64 strings
                                    }
                                }
                                
                                // Check if product already exists (from catalog) - compare by ID and exporter
                                const existingIndex = allProducts.findIndex(p => 
                                    (p.id === normalizedProduct.id && p.exporterId === userId) ||
                                    (p.name === normalizedProduct.name && p.exporterId === userId)
                                );
                                
                                // Only add if not draft and doesn't already exist
                                if (normalizedProduct.status !== 'draft' && existingIndex === -1) {
                                    allProducts.push(normalizedProduct);
                                } else {
                                    if (existingIndex !== -1) {
                                        console.log('Skipped duplicate product from users:', {
                                            id: normalizedProduct.id,
                                            name: normalizedProduct.name,
                                            exporterId: userId
                                        });
                                    } else if (normalizedProduct.status === 'draft') {
                                        console.log('Skipped draft product from users:', {
                                            id: normalizedProduct.id,
                                            name: normalizedProduct.name,
                                            status: normalizedProduct.status
                                        });
                                    }
                                }
                            }
                        });
                    }
                });
                console.log(`Loaded products from users, total: ${allProducts.length}`);
            } catch (usersError) {
                console.warn('Could not load from users:', usersError);
            }

            if (loadingEl) loadingEl.style.display = 'none';
            
            // Log all products for debugging
            console.log('All products before filtering:', allProducts);
            
            // Filter out products without required fields - be more lenient
            const validProducts = allProducts.filter(p => {
                // Ensure name exists and is not empty
                const hasName = p.name && typeof p.name === 'string' && p.name.trim() !== '';
                
                // Ensure price exists and is a valid number (check both price and priceValue)
                const priceValue = parseFloat(p.priceValue) || parseFloat(p.price) || 0;
                const hasPrice = !isNaN(priceValue) && priceValue >= 0;
                
                // Log filtered products for debugging
                if (!hasName || !hasPrice) {
                    console.warn('Filtered out product:', {
                        id: p.id,
                        name: p.name,
                        nameType: typeof p.name,
                        price: p.price,
                        priceValue: p.priceValue,
                        priceType: typeof p.price,
                        calculatedPriceValue: priceValue,
                        hasName,
                        hasPrice,
                        fullProduct: p
                    });
                }
                
                return hasName && hasPrice;
            });
            
            console.log(`Valid products after filtering: ${validProducts.length} out of ${allProducts.length}`);
            
            if (validProducts.length === 0) {
                console.log('No valid products found. All products:', allProducts);
                console.log('Sample product structure:', allProducts[0]);
                if (emptyEl) {
                    emptyEl.innerHTML = `
                        <div style="font-size: 48px; margin-bottom: 20px;">📦</div>
                        <h3 style="color: #6b7280; margin-bottom: 10px;">No Products Available</h3>
                        <p style="color: #9ca3af;">Products were found but failed validation. Check console for details.</p>
                    `;
                    emptyEl.style.display = 'block';
                }
                return;
            }

            console.log(`Rendering ${validProducts.length} products`);
            renderMarketplaceProducts(validProducts);
            if (productsEl) productsEl.style.display = 'grid';
        } catch (error) {
            console.error('Error loading marketplace products:', error);
            console.error('Error details:', error.message, error.stack);
            if (loadingEl) loadingEl.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'block';
        }
    }

    /**
     * Render marketplace products
     */
    function renderMarketplaceProducts(products) {
        const productsEl = document.getElementById('marketplaceProducts');
        if (!productsEl) return;

        productsEl.innerHTML = products.map(product => {
            // Handle image - check if it's already a data URL or needs to be constructed
            let imageSrc = 'https://via.placeholder.com/300x200?text=No+Image';
            
            if (product.imageBase64) {
                // Check if it's already a complete data URL
                if (product.imageBase64.startsWith('data:')) {
                    imageSrc = product.imageBase64;
                } else {
                    // Construct data URL
                    const mimeType = product.imageFileType || 'image/jpeg';
                    imageSrc = `data:${mimeType};base64,${product.imageBase64}`;
                }
            } else if (product.image) {
                // Handle if image is stored in 'image' field
                if (product.image.startsWith('data:')) {
                    imageSrc = product.image;
                } else {
                    const mimeType = product.imageFileType || 'image/jpeg';
                    imageSrc = `data:${mimeType};base64,${product.image}`;
                }
            }

            // Use global escapeHtml function to prevent XSS

            const productId = product.id || product.productId || '';
            const exporterId = product.exporterId || product.userId || '';
            const productName = escapeHtml(product.name || 'Unnamed Product');
            const productDesc = escapeHtml(product.description || 'No description available');
            const exporterName = escapeHtml(product.exporterName || 'Unknown');
            
            // Handle stock quantity - check multiple possible field names (for display only)
            const stockQty = parseFloat(product.stockQuantity) || 
                           parseFloat(product.stock) || 
                           parseFloat(product.quantity) || 
                           'N/A';
            
            // Handle price - support both price/priceValue and currency/priceCurrency
            const priceValue = parseFloat(product.priceValue) || parseFloat(product.price) || 0;
            const priceCurrency = product.priceCurrency || product.currency || 'USD';
            const price = priceValue > 0 
                ? `${priceCurrency} ${priceValue.toLocaleString()}`
                : 'Price on request';
            
            // Get additional product details
            const category = product.category || '';
            const incoterm = product.incoterm || '';

            // Log product for debugging
            console.log('Rendering product:', {
                id: productId,
                name: productName,
                price: priceValue,
                currency: priceCurrency,
                stockQty: stockQty,
                hasImage: !!product.imageBase64 || !!product.image
            });

            return `
                <div class="product-card">
                    <img src="${imageSrc}" alt="${productName}" class="product-image" onerror="this.src='https://via.placeholder.com/300x200?text=No+Image'">
                    <h3 class="product-name">${productName}</h3>
                    <p class="product-description">${productDesc}</p>
                    <div class="product-meta">
                        <span class="product-exporter">From: ${exporterName}</span>
                        ${category ? `<span>${escapeHtml(category)}</span>` : ''}
                        ${incoterm && incoterm !== 'Not specified' ? `<span>${escapeHtml(incoterm)}</span>` : ''}
                    </div>
                    <div class="product-price">${escapeHtml(price)}</div>
                    <button class="btn-add-to-cart" onclick="addToImporterCart('${productId}', '${exporterId}')">
                        Add to Cart
                    </button>
                </div>
            `;
        }).join('');
    }

    /**
     * Add product to cart
     */
    async function addToImporterCart(productId, exporterId) {
        if (!currentUser || !importerDatabase || !exporterDatabase) {
            showToast('Please log in to add items to cart');
            return;
        }

        if (!productId || !exporterId) {
            showToast('Invalid product information');
        return;
    }

    try {
            // Try to fetch product from productCatalog first
            let productSnapshot = await exporterDatabase.ref(`productCatalog/${productId}`).once('value');
            let product = productSnapshot.val();

            // If not found in catalog, try users/{exporterId}/products/{productId}
            if (!product && exporterId) {
                productSnapshot = await exporterDatabase.ref(`users/${exporterId}/products/${productId}`).once('value');
                product = productSnapshot.val();
            }

            if (!product) {
                console.error('Product not found:', productId, exporterId);
                showToast('Product not found');
                return;
            }

            // Stock quantity is not required - allow ordering regardless of stock
            // This allows ordering from anywhere without stock restrictions
            const stockQty = parseFloat(product.stockQuantity) || 
                           parseFloat(product.stock) || 
                           parseFloat(product.quantity) || 
                           999; // Set a high default to allow ordering

            // Load current cart - use importers path to match security rules
            const cartPath = currentUserBasePath ? `${currentUserBasePath}/cart` : `importers/${currentUser.uid}/cart`;
            const cartSnapshot = await importerDatabase.ref(cartPath).once('value');
            const cartData = cartSnapshot.val();
            let cart = cartData ? (Array.isArray(cartData) ? cartData : Object.values(cartData)) : [];

            // Normalize product data - handle both price/priceValue and currency/priceCurrency
            const priceValue = parseFloat(product.priceValue) || parseFloat(product.price) || 0;
            const priceCurrency = product.priceCurrency || product.currency || 'USD';
            
            const normalizedProduct = {
                id: productId,
                name: product.name,
                description: product.description,
                // Support both field names for compatibility
                price: priceValue,
                priceValue: priceValue,
                currency: priceCurrency,
                priceCurrency: priceCurrency,
                imageBase64: product.imageBase64 || product.image,
                imageFileType: product.imageFileType || 'image/jpeg',
                exporterId: exporterId || product.userId || product.exporterId,
                exporterName: product.exporterName || 'Unknown Exporter',
                stockQuantity: stockQty,
                // Include additional product fields
                category: product.category || '',
                incoterm: product.incoterm || '',
                hsCode: product.hsCode || '',
                minOrderQty: product.minOrderQty || '',
                leadTime: product.leadTime || '',
                targetMarkets: product.targetMarkets || '',
                specs: product.specs || '',
                packagingDetails: product.packagingDetails || '',
                certifications: product.certifications || '',
                complianceNotes: product.complianceNotes || '',
                productionCapacity: product.productionCapacity || ''
            };

            // Check if product already in cart
            const existingItem = cart.find(item => item.id === productId && item.exporterId === normalizedProduct.exporterId);
            
            if (existingItem) {
                // Allow unlimited quantity - no stock restrictions
                existingItem.quantity += 1;
            } else {
                cart.push({
                    ...normalizedProduct,
                    quantity: 1,
                    stockQuantity: stockQty // Store for reference but don't enforce
                });
            }

            // Save cart - reuse cartPath already declared above
            await importerDatabase.ref(cartPath).set(cart);
            showToast('Product added to cart');
            updateImporterCartBadge(cart);
            
            // If cart tab is active, refresh it
            if (activeTab === 'cart') {
                loadImporterCart();
            }
        } catch (error) {
            console.error('Error adding to cart:', error);
            showToast('Failed to add product to cart');
        }
    }

    /**
     * Load cart from Firebase
     */
    async function loadImporterCart() {
        if (!currentUser || !importerDatabase) {
            showEmptyImporterCart();
            return;
        }

        try {
            // Use importers path to match security rules
            const cartPath = currentUserBasePath ? `${currentUserBasePath}/cart` : `importers/${currentUser.uid}/cart`;
            const snapshot = await importerDatabase.ref(cartPath).once('value');
            const cartData = snapshot.val();
            let cart = cartData ? (Array.isArray(cartData) ? cartData : Object.values(cartData)) : [];

        renderImporterCart(cart);
        updateImporterCartBadge(cart);
    } catch (error) {
        console.error('Error loading cart:', error);
        showEmptyImporterCart();
    }
}

/**
 * Render cart items
 */
function renderImporterCart(cart) {
    const cartContent = document.getElementById('importerCartContent');
    const cartFooter = document.getElementById('importerCartFooter');

    if (!cartContent) return;

    if (cart.length === 0) {
        showEmptyImporterCart();
        if (cartFooter) cartFooter.style.display = 'none';
        return;
    }

        cartContent.innerHTML = cart.map(item => {
    // Handle image - support both data URL and base64 formats
    let imageSrc = 'https://via.placeholder.com/100x100?text=No+Image';
    if (item.imageBase64) {
        if (item.imageBase64.startsWith('data:')) {
            imageSrc = item.imageBase64;
        } else {
            imageSrc = `data:${item.imageFileType || 'image/jpeg'};base64,${item.imageBase64}`;
        }
    } else if (item.image) {
        if (item.image.startsWith('data:')) {
            imageSrc = item.image;
        } else {
            imageSrc = `data:${item.imageFileType || 'image/jpeg'};base64,${item.image}`;
        }
    }
    
    // Handle price - support both price/priceValue and currency/priceCurrency
    const itemPrice = parseFloat(item.priceValue) || parseFloat(item.price) || 0;
    const itemCurrency = item.priceCurrency || item.currency || 'USD';
    const totalPrice = itemPrice * (item.quantity || 1);
    
    // Use global escapeHtml function to prevent XSS

    return `
        <div class="cart-item" style="display: flex; gap: 1rem; padding: 1rem; background: #f9f9f9; border-radius: 12px; margin-bottom: 1rem;">
            <img src="${imageSrc}" alt="${escapeHtml(item.name)}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px; flex-shrink: 0;" onerror="this.src='https://via.placeholder.com/100x100?text=No+Image'">
            <div style="flex: 1; display: flex; flex-direction: column; gap: 0.5rem;">
                <div style="font-weight: 600; color: #333; font-size: 1rem;">${escapeHtml(item.name || 'Unnamed Product')}</div>
                <div style="color: #667eea; font-weight: 600; font-size: 1.1rem;">${escapeHtml(itemCurrency)} ${totalPrice.toLocaleString()}</div>
                ${item.exporterName ? `<div style="color: #666; font-size: 0.9rem;">From: ${escapeHtml(item.exporterName)}</div>` : ''}
                <div style="display: flex; align-items: center; gap: 1rem; margin-top: auto;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; background: white; border: 2px solid #e0e0e0; border-radius: 6px; padding: 0.25rem 0.5rem;">
                                <button onclick="updateImporterCartQuantity('${item.id}', '${item.exporterId}', -1)" style="background: none; border: none; cursor: pointer; color: #667eea; font-weight: 600; padding: 0.25rem 0.5rem;">-</button>
                        <span style="min-width: 30px; text-align: center;">${item.quantity}</span>
                                <button onclick="updateImporterCartQuantity('${item.id}', '${item.exporterId}', 1)" style="background: none; border: none; cursor: pointer; color: #667eea; font-weight: 600; padding: 0.25rem 0.5rem;">+</button>
                    </div>
                            <button onclick="removeImporterCartItem('${item.id}', '${item.exporterId}')" style="background: #ff4757; color: white; border: none; border-radius: 6px; padding: 0.5rem 1rem; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                        Remove
                    </button>
                </div>
            </div>
        </div>
    `;
        }).join('');

        if (cartFooter) {
            cartFooter.style.display = 'block';
            // Handle both price/priceValue and currency/priceCurrency
            const total = cart.reduce((sum, item) => {
                const itemPrice = parseFloat(item.priceValue) || parseFloat(item.price) || 0;
                return sum + (itemPrice * (item.quantity || 1));
            }, 0);
            const currency = cart[0]?.priceCurrency || cart[0]?.currency || 'USD';
            const totalEl = document.getElementById('importerCartTotal');
            if (totalEl) {
                totalEl.textContent = `${currency} ${total.toLocaleString()}`;
            }
        }
}

/**
 * Show empty cart
 */
function showEmptyImporterCart() {
    const cartContent = document.getElementById('importerCartContent');
    if (cartContent) {
        cartContent.innerHTML = `
            <div class="cart-empty" style="text-align: center; padding: 3rem 1rem; color: #666;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">🛒</div>
                <h3 style="color: #333; margin-bottom: 0.5rem;">Your cart is empty</h3>
                <p>Add products from the marketplace to see them here</p>
            </div>
        `;
    }
}

/**
 * Update cart quantity
 */
    async function updateImporterCartQuantity(productId, exporterId, change) {
        if (!currentUser || !importerDatabase) return;

    try {
            const snapshot = await importerDatabase.ref(`users/${currentUser.uid}/cart`).once('value');
        const cartData = snapshot.val();
            let cart = cartData ? (Array.isArray(cartData) ? cartData : Object.values(cartData)) : [];

            const item = cart.find(item => item.id === productId && item.exporterId === exporterId);
        if (!item) return;

        item.quantity += change;
        if (item.quantity <= 0) {
                cart = cart.filter(item => !(item.id === productId && item.exporterId === exporterId));
        }
            // No stock quantity restrictions - allow unlimited quantity

            await importerDatabase.ref(`users/${currentUser.uid}/cart`).set(cart);
        renderImporterCart(cart);
        updateImporterCartBadge(cart);
    } catch (error) {
        console.error('Error updating cart:', error);
    }
}

/**
 * Remove cart item
 */
    async function removeImporterCartItem(productId, exporterId) {
        if (!currentUser || !importerDatabase) return;

    try {
            // Use importers path to match security rules
            const cartPath = currentUserBasePath ? `${currentUserBasePath}/cart` : `importers/${currentUser.uid}/cart`;
            const snapshot = await importerDatabase.ref(cartPath).once('value');
        const cartData = snapshot.val();
            let cart = cartData ? (Array.isArray(cartData) ? cartData : Object.values(cartData)) : [];

            cart = cart.filter(item => !(item.id === productId && item.exporterId === exporterId));
            await importerDatabase.ref(cartPath).set(cart);
        renderImporterCart(cart);
        updateImporterCartBadge(cart);
    } catch (error) {
        console.error('Error removing cart item:', error);
    }
}

/**
 * Update cart badge
 */
function updateImporterCartBadge(cart) {
    const cartBadge = document.getElementById('importerCartBadge');
    if (!cartBadge) return;

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartBadge.textContent = totalItems;
    cartBadge.style.display = totalItems > 0 ? 'inline-block' : 'none';
}

/**
     * Generate order ID
     */
    function generateImporterOrderId() {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000);
        return `ORD-${timestamp}-${random}`;
}

    // ============================================
    // CHECKOUT MODAL FUNCTIONS
    // ============================================

    let currentCheckoutCart = [];
    let currentCheckoutStep = 1;
    let uploadedDocuments = {};

    /**
     * Proceed to checkout - opens checkout modal
     */
    async function proceedImporterCheckout() {
        if (!currentUser || !importerDatabase || !exporterDatabase) {
            showToast('Please log in to proceed');
            return;
        }

        try {
            // Load cart
            const cartPath = currentUserBasePath ? `${currentUserBasePath}/cart` : `importers/${currentUser.uid}/cart`;
            const cartSnapshot = await importerDatabase.ref(cartPath).once('value');
            const cartData = cartSnapshot.val();
            let cart = cartData ? (Array.isArray(cartData) ? cartData : Object.values(cartData)) : [];

            if (cart.length === 0) {
                showToast('Your cart is empty. Add products to proceed.');
                return;
            }

            // Open checkout modal
            openCheckoutModal(cart);
        } catch (error) {
            console.error('Error loading cart:', error);
            showToast('Error loading cart. Please try again.');
        }
    }

    /**
     * Open checkout modal
     */
    function openCheckoutModal(cart) {
        currentCheckoutCart = cart;
        currentCheckoutStep = 1;
        uploadedDocuments = {};
        
        const modal = document.getElementById('checkoutModal');
        if (!modal) {
            console.error('Checkout modal not found');
            return;
        }

        // Calculate total
        const total = cart.reduce((sum, item) => {
            const itemPrice = parseFloat(item.priceValue) || parseFloat(item.price) || 0;
            return sum + (itemPrice * (item.quantity || 1));
        }, 0);
        const currency = cart[0]?.priceCurrency || cart[0]?.currency || 'USD';
        
        // Update order summary
        updateCheckoutOrderSummary(cart, total, currency);
        
        // Reset form and clear file previews
        const form = document.getElementById('checkoutForm');
        if (form) form.reset();
        clearFilePreviews();
        
        // Prefill shipping info from profile if available (for step 2)
        if (currentUser) {
            const profilePath = currentUserBasePath ? `${currentUserBasePath}/profile` : `importers/${currentUser.uid}/profile`;
            importerDatabase.ref(profilePath).once('value').then(snapshot => {
                const profile = snapshot.val() || {};
                const fullNameEl = document.getElementById('shippingFullName');
                const emailEl = document.getElementById('shippingEmail');
                const phoneEl = document.getElementById('shippingPhone');
                const addressEl = document.getElementById('shippingAddress');
                const cityEl = document.getElementById('shippingCity');
                const stateEl = document.getElementById('shippingState');
                const countryEl = document.getElementById('shippingCountry');
                const zipEl = document.getElementById('shippingZipCode');
                
                if (fullNameEl && profile.fullName) fullNameEl.value = profile.fullName;
                if (emailEl && currentUser.email) emailEl.value = currentUser.email;
                if (phoneEl && profile.phoneNumber) phoneEl.value = profile.phoneNumber;
                if (addressEl && profile.businessAddress) addressEl.value = profile.businessAddress;
                if (cityEl && profile.city) cityEl.value = profile.city;
                if (stateEl && profile.state) stateEl.value = profile.state;
                if (countryEl && profile.country) countryEl.value = profile.country;
                if (zipEl && profile.pincode) zipEl.value = profile.pincode;
            }).catch(err => console.error('Error loading profile:', err));
        }
        
        // Show first step (Documents)
        goToCheckoutStep(1);
        
        // Show modal
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    /**
     * Close checkout modal
     */
    function closeCheckoutModal() {
        const modal = document.getElementById('checkoutModal');
        if (modal) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }
        currentCheckoutCart = [];
        currentCheckoutStep = 1;
        uploadedDocuments = {};
    }

    /**
     * Go to checkout step
     */
    function goToCheckoutStep(step) {
        // Hide all steps
        for (let i = 1; i <= 3; i++) {
            const stepEl = document.getElementById(`checkoutStep${i}`);
            if (stepEl) {
                stepEl.classList.remove('active');
            }
        }
        
        // Show selected step
        const stepEl = document.getElementById(`checkoutStep${step}`);
        if (stepEl) {
            stepEl.classList.add('active');
            currentCheckoutStep = step;
        }
    }

    /**
     * Update checkout order summary
     */
    function updateCheckoutOrderSummary(cart, total, currency) {
        const summaryEl = document.getElementById('checkoutOrderSummary');
        const totalEl = document.getElementById('checkoutTotalAmount');
        
        if (summaryEl) {
            summaryEl.innerHTML = cart.map(item => {
                const itemPrice = parseFloat(item.priceValue) || parseFloat(item.price) || 0;
                const itemTotal = itemPrice * (item.quantity || 1);
                return `
                    <div class="order-summary-item">
                        <span>${escapeHtml(item.name || 'Unnamed Product')} x ${item.quantity || 1}</span>
                        <span>${currency} ${itemTotal.toLocaleString()}</span>
                    </div>
                `;
            }).join('');
        }
        
        if (totalEl) {
            totalEl.textContent = `${currency} ${total.toLocaleString()}`;
        }
    }

    /**
     * Select payment method
     */
    function selectPaymentMethod(method) {
        const buttons = document.querySelectorAll('.payment-method-btn');
        buttons.forEach(btn => btn.classList.remove('active'));
        
        const clickedBtn = event.target.closest('.payment-method-btn');
        if (clickedBtn) {
            clickedBtn.classList.add('active');
        }
        
        const methodInput = document.getElementById('selectedPaymentMethod');
        if (methodInput) {
            methodInput.value = method;
        }
        
        // Show/hide payment method containers (only razorpay and paylater)
        const razorpayContainer = document.getElementById('razorpayContainer');
        const payLaterContainer = document.getElementById('payLaterContainer');
        
        if (razorpayContainer) {
            razorpayContainer.style.display = method === 'razorpay' ? 'block' : 'none';
        }
        if (payLaterContainer) {
            payLaterContainer.style.display = method === 'paylater' ? 'block' : 'none';
        }
    }

    /**
     * Setup checkout file uploads
     */
    function setupCheckoutFileUploads() {
        const fileInputs = ['commercialInvoice', 'packingList', 'certificateOfOrigin', 'exportLicense'];
        
        fileInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('change', (e) => {
                    handleCheckoutFileUpload(e, inputId);
                });
            }
        });
    }

    /**
     * Handle checkout file upload
     */
    function handleCheckoutFileUpload(event, inputId) {
        const file = event.target.files[0];
        if (!file) return;

        const previewEl = document.getElementById(`${inputId}Preview`);
        if (!previewEl) return;

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('File size must be less than 5MB');
            event.target.value = '';
            return;
        }

        // Convert to base64
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target.result.split(',')[1];
            uploadedDocuments[inputId] = {
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                base64: base64
            };
            
            previewEl.textContent = `✓ ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
            previewEl.classList.add('has-file');
        };
        reader.readAsDataURL(file);
    }

    /**
     * Clear file previews
     */
    function clearFilePreviews() {
        const previews = document.querySelectorAll('.file-preview');
        previews.forEach(preview => {
            preview.textContent = '';
            preview.classList.remove('has-file');
        });
    }

    /**
     * Show checkout message
     */
    function showCheckoutMessage(message, type = 'info') {
        const messageEl = document.getElementById('checkoutMessage');
        if (messageEl) {
            messageEl.textContent = message;
            messageEl.className = `checkout-message ${type}`;
            messageEl.style.display = 'block';
            
            setTimeout(() => {
                messageEl.style.display = 'none';
            }, 5000);
        }
    }

    /**
     * Validate checkout data
     */
    function validateCheckoutData() {
        if (!currentUser || !importerDatabase || !exporterDatabase) {
            showCheckoutMessage('Please login to place order.', 'error');
            return false;
        }

        if (currentCheckoutCart.length === 0) {
            showCheckoutMessage('Your cart is empty.', 'error');
            return false;
        }

        // Validate required documents
        if (!uploadedDocuments.commercialInvoice || !uploadedDocuments.packingList) {
            showCheckoutMessage('Please upload required documents (Commercial Invoice and Packing List).', 'error');
            goToCheckoutStep(1);
            return false;
        }

        // Validate shipping information
        const fullName = document.getElementById('shippingFullName')?.value.trim();
        const email = document.getElementById('shippingEmail')?.value.trim();
        const phone = document.getElementById('shippingPhone')?.value.trim();
        const address = document.getElementById('shippingAddress')?.value.trim();
        const city = document.getElementById('shippingCity')?.value.trim();
        const state = document.getElementById('shippingState')?.value.trim();
        const country = document.getElementById('shippingCountry')?.value.trim();
        const zipCode = document.getElementById('shippingZipCode')?.value.trim();

        if (!fullName || !email || !phone || !address || !city || !state || !country || !zipCode) {
            showCheckoutMessage('Please fill in all required shipping information.', 'error');
            goToCheckoutStep(2);
            return false;
        }

        return true;
    }

    /**
     * Get checkout form data
     */
    function getCheckoutFormData() {
        const total = currentCheckoutCart.reduce((sum, item) => {
            const itemPrice = parseFloat(item.priceValue) || parseFloat(item.price) || 0;
            return sum + (itemPrice * (item.quantity || 1));
        }, 0);
        const currency = currentCheckoutCart[0]?.priceCurrency || currentCheckoutCart[0]?.currency || 'USD';

        return {
            shipping: {
                fullName: document.getElementById('shippingFullName').value.trim(),
                email: document.getElementById('shippingEmail').value.trim(),
                phone: document.getElementById('shippingPhone').value.trim(),
                address: document.getElementById('shippingAddress').value.trim(),
                city: document.getElementById('shippingCity').value.trim(),
                state: document.getElementById('shippingState').value.trim(),
                country: document.getElementById('shippingCountry').value.trim(),
                zipCode: document.getElementById('shippingZipCode').value.trim(),
                notes: document.getElementById('shippingNotes')?.value.trim() || ''
            },
            documents: uploadedDocuments,
            paymentMethod: document.getElementById('selectedPaymentMethod').value,
            items: currentCheckoutCart,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            userName: currentUser.displayName || currentUser.email,
            orderId: generateImporterOrderId(),
            totalAmount: total,
            currency: currency,
            createdAt: new Date().toISOString(),
            status: 'pending'
        };
    }

    /**
     * Process Razorpay payment now
     */
    async function processRazorpayPaymentNow() {
        if (!validateCheckoutData()) {
            return;
        }

        const formData = getCheckoutFormData();
        const total = formData.totalAmount;
        const currency = formData.currency;

        const payNowBtn = document.getElementById('payNowBtn');
        if (payNowBtn) {
            payNowBtn.disabled = true;
            payNowBtn.textContent = 'Processing...';
        }

        try {
            await processRazorpayPayment(formData, total, currency);
        } catch (error) {
            console.error('Error processing Razorpay payment:', error);
            showCheckoutMessage('Error processing payment. Please try again.', 'error');
        } finally {
            if (payNowBtn) {
                payNowBtn.disabled = false;
                payNowBtn.textContent = 'Pay Now with Razorpay';
            }
        }
    }

    /**
     * Process Pay Later order
     */
    async function processPayLaterOrder() {
        if (!validateCheckoutData()) {
            return;
        }

        const formData = getCheckoutFormData();
        formData.paymentMethod = 'paylater';
        formData.paymentStatus = 'pending';

        const payLaterBtn = document.getElementById('payLaterBtn');
        if (payLaterBtn) {
            payLaterBtn.disabled = true;
            payLaterBtn.textContent = 'Processing...';
        }

        try {
            await saveImporterOrder(formData);
            await clearCartAfterOrder();
            showCheckoutMessage('Order placed successfully! Payment is pending.', 'success');
            setTimeout(() => {
                closeCheckoutModal();
    loadImporterCart();
                loadImporterOrderHistory();
            }, 2000);
        } catch (error) {
            console.error('Error processing order:', error);
            showCheckoutMessage('Error processing order. Please try again.', 'error');
        } finally {
            if (payLaterBtn) {
                payLaterBtn.disabled = false;
                payLaterBtn.textContent = 'Place Order (Pay Later)';
            }
        }
    }

    /**
     * Process Razorpay payment
     */
    async function processRazorpayPayment(orderData, amount, currency) {
        // TODO: Replace with your actual Razorpay Key ID from Razorpay Dashboard
        // Get your keys from: https://dashboard.razorpay.com/app/keys
        const RAZORPAY_KEY_ID = 'rzp_test_1DP5mmOlF5G5ag'; // Replace with your Razorpay Key ID
        
        const options = {
            key: RAZORPAY_KEY_ID,
            amount: Math.round(amount * 100), // Convert to paise
            currency: currency,
            name: 'FXcgo',
            description: `Order #${orderData.orderId}`,
            handler: async function(response) {
                // Payment successful
                orderData.paymentStatus = 'paid';
                orderData.paymentId = response.razorpay_payment_id;
                orderData.razorpayOrderId = response.razorpay_order_id;
                orderData.razorpaySignature = response.razorpay_signature;
                
                try {
                    await saveImporterOrder(orderData);
                    await clearCartAfterOrder();
                    showCheckoutMessage('Payment successful! Order placed.', 'success');
                    setTimeout(() => {
                        closeCheckoutModal();
                        loadImporterCart();
                        loadImporterOrderHistory();
                    }, 2000);
                } catch (error) {
                    console.error('Error saving order:', error);
                    showCheckoutMessage('Payment successful but error saving order. Please contact support.', 'error');
                }
            },
            prefill: {
                name: orderData.shipping.fullName,
                email: orderData.shipping.email,
                contact: orderData.shipping.phone
            },
            theme: {
                color: '#667eea'
            },
            modal: {
                ondismiss: function() {
                    showCheckoutMessage('Payment cancelled.', 'error');
                    const placeOrderBtn = document.getElementById('placeOrderBtn');
                    if (placeOrderBtn) {
                        placeOrderBtn.disabled = false;
                        placeOrderBtn.textContent = 'Place Order';
                    }
                }
            }
        };

        const razorpay = new Razorpay(options);
        razorpay.open();
    }

    /**
     * Clear cart after order
     */
    async function clearCartAfterOrder() {
        try {
            const cartPath = currentUserBasePath ? `${currentUserBasePath}/cart` : `importers/${currentUser.uid}/cart`;
            await importerDatabase.ref(cartPath).set([]);
            updateImporterCartBadge([]);
        } catch (error) {
            console.error('Error clearing cart:', error);
        }
    }

    /**
     * Save order to Firebase
     */
    async function saveImporterOrder(orderData) {
        try {
            // Ensure orderData includes all necessary fields
            if (!orderData.shipping) {
                // Fallback if shipping data is missing
                orderData.shipping = {
                    fullName: orderData.userName || '',
                    email: orderData.userEmail || '',
                    phone: '',
                    address: '',
                    city: '',
                    state: '',
                    country: '',
                    zipCode: '',
                    notes: ''
                };
            }
            
            if (!orderData.documents) {
                orderData.documents = {};
            }
            
            // Save to importer's order history
            // Use importers path to match security rules
            const ordersPath = currentUserBasePath ? `${currentUserBasePath}/orders` : `importers/${currentUser.uid}/orders`;
            const importerOrderRef = importerDatabase.ref(ordersPath).push();
            await importerOrderRef.set(orderData);

            // Group items by exporter and save to each exporter's incoming orders
            const ordersByExporter = {};
            
            orderData.items.forEach(item => {
                const exporterId = item.exporterId;
                if (!exporterId) return;

                if (!ordersByExporter[exporterId]) {
                    ordersByExporter[exporterId] = {
                        ...orderData,
                        items: [],
                        buyerId: currentUser.uid,
                        buyerName: orderData.userName,
                        buyerEmail: orderData.userEmail
                    };
                }
                
                ordersByExporter[exporterId].items.push(item);
            });

            // Save to each exporter's incoming orders
            for (const [exporterId, exporterOrder] of Object.entries(ordersByExporter)) {
                try {
                    const orderRef = exporterDatabase.ref(`users/${exporterId}/incomingOrders`).push();
                    await orderRef.set(exporterOrder);

                    // Create notification for exporter
                    await exporterDatabase.ref(`users/${exporterId}/notifications`).push({
                        type: 'new_order',
                        orderId: orderData.orderId,
                        buyerName: orderData.userName,
                        totalAmount: orderData.totalAmount,
                        currency: orderData.currency,
                        itemCount: exporterOrder.items.length,
                        createdAt: new Date().toISOString()
                    });
                } catch (error) {
                    console.error(`Error saving order to exporter ${exporterId}:`, error);
                }
            }

            // Clear cart
            // Clear cart - use importers path to match security rules
            const cartPath = currentUserBasePath ? `${currentUserBasePath}/cart` : `importers/${currentUser.uid}/cart`;
            await importerDatabase.ref(cartPath).set([]);
            
            showToast('Order placed successfully!');
            loadImporterCart();
            loadImporterOrderHistory();
        } catch (error) {
            console.error('Error saving order:', error);
            showToast('Failed to save order');
        }
    }

    /**
     * Load order history
     */
    async function loadImporterOrderHistory() {
        if (!currentUser || !importerDatabase) return;

        try {
            // Use importers path to match security rules
            const ordersPath = currentUserBasePath ? `${currentUserBasePath}/orders` : `importers/${currentUser.uid}/orders`;
            const snapshot = await importerDatabase.ref(ordersPath).once('value');
            const ordersData = snapshot.val();
            let orders = ordersData ? (Array.isArray(ordersData) ? ordersData : Object.values(ordersData)) : [];

            // Sort by creation date (newest first)
            orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

            renderImporterOrderHistory(orders);
        } catch (error) {
            console.error('Error loading order history:', error);
        }
    }

    /**
     * Render order history
     */
    function renderImporterOrderHistory(orders) {
        const historyEl = document.getElementById('importerOrderHistory');
        if (!historyEl) return;

        if (orders.length === 0) {
            historyEl.innerHTML = '<p style="text-align: center; color: #64748b; padding: 2rem;">No orders yet</p>';
            return;
        }

        historyEl.innerHTML = orders.map(order => {
            const statusClass = order.status === 'cancelled' ? 'cancelled' : 
                               order.status === 'completed' ? 'completed' :
                               order.paymentStatus === 'paid' ? 'confirmed' : 'pending';

            return `
                <div class="order-history-item" style="margin-bottom: 1.5rem; padding: 1.5rem; background: white; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <div class="order-history-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #e2e8f0;">
                        <span class="order-id" style="font-weight: 600; color: #334155;">Order #${order.orderId || order.id}</span>
                        <span class="order-status ${statusClass}" style="padding: 0.25rem 0.75rem; border-radius: 6px; font-size: 0.85rem; font-weight: 500; background: ${statusClass === 'completed' ? '#dcfce7' : statusClass === 'cancelled' ? '#fee2e2' : '#fef3c7'}; color: ${statusClass === 'completed' ? '#166534' : statusClass === 'cancelled' ? '#991b1b' : '#92400e'};">${order.status || 'pending'}</span>
                    </div>
                    <div class="order-details" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
                        <div><strong style="color: #64748b;">Total:</strong> <span style="color: #334155;">${order.currency || 'USD'} ${order.totalAmount?.toLocaleString() || '0'}</span></div>
                        <div><strong style="color: #64748b;">Items:</strong> <span style="color: #334155;">${order.items?.length || 0}</span></div>
                        <div><strong style="color: #64748b;">Payment:</strong> <span style="color: #334155;">${order.paymentMethod || 'N/A'}</span></div>
                        <div><strong style="color: #64748b;">Date:</strong> <span style="color: #334155;">${new Date(order.createdAt || Date.now()).toLocaleDateString()}</span></div>
                    </div>
                    
                    ${order.orderUpdates && order.orderUpdates.length > 0 ? `
                    <div class="order-updates-section" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0;">
                        <h4 style="margin-bottom: 1rem; color: #334155; font-size: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            Order Updates from Exporter
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 1rem;">
                            ${order.orderUpdates.map((update, idx) => `
                                <div style="padding: 1rem; background: #f0f9ff; border-radius: 8px; border-left: 3px solid #0ea5e9;">
                                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                                        <span style="font-size: 0.85rem; color: #64748b;">${new Date(update.sentAt || update.createdAt).toLocaleString()}</span>
                                        ${update.sentByName ? `<span style="font-size: 0.85rem; color: #64748b;">From: ${escapeHtml(update.sentByName)}</span>` : ''}
                                    </div>
                                    ${update.message ? `<p style="color: #334155; margin: 0.5rem 0;">${escapeHtml(update.message)}</p>` : ''}
                                    ${update.documents && update.documents.length > 0 ? `
                                        <div style="margin-top: 0.75rem;">
                                            <p style="font-weight: 500; margin-bottom: 0.5rem; color: #334155; font-size: 0.9rem;">📎 Documents (${update.documents.length}):</p>
                                            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                                ${update.documents.map(doc => {
                                                    const docUrl = doc.base64 ? `data:${doc.fileType || 'application/octet-stream'};base64,${doc.base64}` : '#';
                                                    return `
                                                        <a href="${docUrl}" download="${escapeHtml(doc.fileName || 'document')}" target="_blank" style="display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.5rem 0.75rem; background: #0ea5e9; color: white; border-radius: 6px; text-decoration: none; font-size: 0.85rem;">
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                                <polyline points="7 10 12 15 17 10"></polyline>
                                                                <line x1="12" y1="15" x2="12" y2="3"></line>
                                                            </svg>
                                                            ${escapeHtml(doc.fileName || 'Document')}
                                                        </a>
                                                    `;
                                                }).join('')}
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                    
                    ${order.status !== 'cancelled' && order.status !== 'completed' ? `
                        <div class="order-actions" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e2e8f0;">
                            <button class="btn-cancel-order" onclick="cancelImporterOrder('${order.orderId || order.id}')" style="padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid #ef4444; background: white; color: #ef4444; cursor: pointer;">
                                Cancel Order
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    /**
     * Cancel order
     */
    async function cancelImporterOrder(orderId) {
        if (!currentUser || !importerDatabase || !exporterDatabase) return;

        if (!confirm('Are you sure you want to cancel this order?')) return;

        try {
            // Use importers path to match security rules
            const ordersPath = currentUserBasePath ? `${currentUserBasePath}/orders` : `importers/${currentUser.uid}/orders`;
            // Find and update order in importer's orders
            const snapshot = await importerDatabase.ref(ordersPath).once('value');
            const ordersData = snapshot.val();
            
            if (!ordersData) return;

            let orderFound = false;
            const updates = {};

            if (Array.isArray(ordersData)) {
                ordersData.forEach((order, index) => {
                    if (order.orderId === orderId) {
                        updates[`${ordersPath}/${index}/status`] = 'cancelled';
                        updates[`${ordersPath}/${index}/updatedAt`] = new Date().toISOString();
                        orderFound = true;
                    }
                });
        } else {
                Object.keys(ordersData).forEach(key => {
                    if (ordersData[key].orderId === orderId) {
                        updates[`${ordersPath}/${key}/status`] = 'cancelled';
                        updates[`${ordersPath}/${key}/updatedAt`] = new Date().toISOString();
                        orderFound = true;
                    }
                });
            }

            if (!orderFound) {
                showToast('Order not found');
                return;
            }

            // Update in importer database
            await importerDatabase.ref().update(updates);

            // Update in exporter's incoming orders
            const orderSnapshot = await importerDatabase.ref(ordersPath).once('value');
            const allOrders = orderSnapshot.val();
            let order = null;

            if (Array.isArray(allOrders)) {
                order = allOrders.find(o => o.orderId === orderId);
            } else {
                order = Object.values(allOrders).find(o => o.orderId === orderId);
            }

            if (order && order.items) {
                // Group by exporter and update
                const exporters = [...new Set(order.items.map(item => item.exporterId).filter(Boolean))];
                
                for (const exporterId of exporters) {
                    try {
                        const exporterOrdersSnapshot = await exporterDatabase.ref(`users/${exporterId}/incomingOrders`).once('value');
                        const exporterOrders = exporterOrdersSnapshot.val();
                        
                        if (exporterOrders) {
                            const exporterUpdates = {};
                            Object.keys(exporterOrders).forEach(key => {
                                if (exporterOrders[key].orderId === orderId) {
                                    exporterUpdates[`users/${exporterId}/incomingOrders/${key}/status`] = 'cancelled';
                                    exporterUpdates[`users/${exporterId}/incomingOrders/${key}/updatedAt`] = new Date().toISOString();
                                }
                            });
                            
                            if (Object.keys(exporterUpdates).length > 0) {
                                await exporterDatabase.ref().update(exporterUpdates);
                            }
                        }
                    } catch (error) {
                        console.error(`Error updating exporter ${exporterId}:`, error);
                    }
                }
            }

            showToast('Order cancelled successfully');
            loadImporterOrderHistory();
        } catch (error) {
            console.error('Error cancelling order:', error);
            showToast('Failed to cancel order');
        }
    }

    /**
     * Refresh marketplace products
     */
    function refreshMarketplaceProducts() {
        loadMarketplaceProducts();
    }

    // Make functions globally available - expose all functions that might be called from HTML
    window.addToImporterCart = addToImporterCart;
    window.updateImporterCartQuantity = updateImporterCartQuantity;
    window.removeImporterCartItem = removeImporterCartItem;
    window.proceedImporterCheckout = proceedImporterCheckout;
    window.cancelImporterOrder = cancelImporterOrder;
    window.refreshMarketplaceProducts = refreshMarketplaceProducts;
    window.loadImporterCart = loadImporterCart;
    window.loadMarketplaceProducts = loadMarketplaceProducts;
    window.loadImporterOrderHistory = loadImporterOrderHistory;
    window.renderImporterOrderHistory = renderImporterOrderHistory;
    
    // Checkout modal functions
    window.openCheckoutModal = openCheckoutModal;
    window.closeCheckoutModal = closeCheckoutModal;
    window.goToCheckoutStep = goToCheckoutStep;
    window.selectPaymentMethod = selectPaymentMethod;
    window.processRazorpayPaymentNow = processRazorpayPaymentNow;
    window.processPayLaterOrder = processPayLaterOrder;
    window.setupCheckoutFileUploads = setupCheckoutFileUploads;
    window.renderImporterCart = renderImporterCart;
    window.updateImporterCartBadge = updateImporterCartBadge;
    window.showToast = showToast;
    window.activateSection = activateSection;
    
    // Expose Firebase instances for forward contract code (outside IIFE)
    window.getImporterDatabase = () => importerDatabase;
    window.getImporterAuth = () => importerAuth;
    window.getCurrentUser = () => currentUser;
    window.getCurrentUserBasePath = () => currentUserBasePath;

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeDashboard);
    } else {
        // DOM already loaded
        initializeDashboard();
    }

    function initializeDashboard() {
        try {
            initFirebase();
            const initialTab = normalizeTab(window.location.hash.replace('#', ''));
            activateSection(initialTab, { syncHash: false, force: true });
            attachEvents();
            initAuthListener();
            console.log('Importer dashboard initialized successfully');
        } catch (error) {
            console.error('Error initializing importer dashboard:', error);
            showToast('Error initializing dashboard. Please refresh the page.');
        }
    }
})();

// ============================================
// FORWARD CONTRACT NOTE GENERATOR (IMPORTER)
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Setup checkout file uploads
    if (window.setupCheckoutFileUploads) {
        window.setupCheckoutFileUploads();
    }
    
    const form = document.getElementById('importerForwardContractForm');
    const resultsSection = document.getElementById('importerForwardContractResults');
    const currencyPairSelect = document.getElementById('importerForwardContractCurrencyPair');
    const currencyPriceDiv = document.getElementById('importerForwardContractCurrencyPrice');

    if (!form || !resultsSection || !currencyPairSelect || !currencyPriceDiv) {
        // Elements not found, likely not on contracts page
        return;
    }

    // Fetch real-time currency rate when pair is selected
    currencyPairSelect.addEventListener('change', function() {
        const currencyPair = this.value;
        if (currencyPair) {
            fetchImporterCurrencyRate(currencyPair);
        } else {
            currencyPriceDiv.innerHTML = '';
            currencyPriceDiv.className = 'forward-contract-currency-price';
        }
    });

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        const amount = document.getElementById('importerForwardContractAmount').value;
        const settlementDate = document.getElementById('importerForwardContractSettlementDate').value;
        const riskTolerance = document.getElementById('importerForwardContractRiskTolerance').value;
        const currencyPair = document.getElementById('importerForwardContractCurrencyPair').value;

        // Format settlement date for display
        const formattedDate = new Date(settlementDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Generate fake analysis results
        const idealWindow = generateIdealWindow(riskTolerance);
        const volatility = generateVolatility(currencyPair);
        const recommendation = generateRecommendation(riskTolerance, volatility);

        // Calculate preferred and least preferred lock-in dates
        const settlementDateObj = new Date(settlementDate);
        const lockInDates = calculateLockInDates(settlementDateObj, riskTolerance, volatility, currencyPair);

        // Fetch current rate for results
        let currentRate = null;
        try {
            const [baseCurrency, quoteCurrency] = currencyPair.split('/');
            if (baseCurrency === 'USD') {
                currentRate = await fetchRateFromUSD(quoteCurrency);
            } else if (quoteCurrency === 'USD') {
                const inverseRate = await fetchRateFromUSD(baseCurrency);
                currentRate = 1 / inverseRate;
            } else {
                const baseToUSD = await fetchRateFromUSD(baseCurrency);
                const quoteToUSD = await fetchRateFromUSD(quoteCurrency);
                currentRate = baseToUSD / quoteToUSD;
            }
        } catch (error) {
            console.error('Error fetching rate for results:', error);
        }

        // Calculate estimated rates for preferred and least preferred dates
        let preferredDateRate = null;
        let leastPreferredDateRate = null;
        if (currentRate) {
            const volNum = parseFloat(volatility);
            preferredDateRate = estimateFutureRate(currentRate, volNum, lockInDates.preferredDaysBefore, 'preferred');
            leastPreferredDateRate = estimateFutureRate(currentRate, volNum, lockInDates.leastPreferredDaysBefore, 'leastPreferred');
        }

        // Calculate risk premium and final amounts
        const volNum = parseFloat(volatility);
        const riskPremium = calculateRiskPremium(parseFloat(amount), riskTolerance, volNum);
        
        let preferredFinalAmount = null;
        let leastPreferredFinalAmount = null;
        
        if (preferredDateRate && amount) {
            preferredFinalAmount = calculateFinalAmount(parseFloat(amount), preferredDateRate, riskPremium, 'preferred');
        }
        
        if (leastPreferredDateRate && amount) {
            leastPreferredFinalAmount = calculateFinalAmount(parseFloat(amount), leastPreferredDateRate, riskPremium, 'leastPreferred');
        }

        // Display results
        displayImporterResults({
            amount,
            settlementDate: formattedDate,
            riskTolerance,
            currencyPair,
            idealWindow,
            volatility,
            recommendation,
            currentRate,
            preferredDate: lockInDates.preferred,
            leastPreferredDate: lockInDates.leastPreferred,
            preferredDateFormatted: lockInDates.preferredFormatted,
            leastPreferredDateFormatted: lockInDates.leastPreferredFormatted,
            preferredDateRate: preferredDateRate,
            leastPreferredDateRate: leastPreferredDateRate,
            riskPremium: riskPremium,
            preferredFinalAmount: preferredFinalAmount,
            leastPreferredFinalAmount: leastPreferredFinalAmount
        });
    });

    function generateIdealWindow(riskTolerance) {
        const windows = {
            low: '7-10 days before settlement',
            medium: '10-14 days before settlement',
            high: '14-21 days before settlement'
        };
        return windows[riskTolerance] || '10-14 days before settlement';
    }

    function generateVolatility(currencyPair) {
        const volatilities = {
            'USD/EUR': '2.3%',
            'USD/GBP': '3.1%',
            'USD/JPY': '4.2%',
            'USD/INR': '1.8%',
            'EUR/GBP': '2.7%',
            'EUR/JPY': '3.9%',
            'GBP/JPY': '4.5%'
        };
        return volatilities[currencyPair] || '2.5%';
    }

    function generateRecommendation(riskTolerance, volatility) {
        const riskLevel = riskTolerance.charAt(0).toUpperCase() + riskTolerance.slice(1);
        const volNum = parseFloat(volatility);
        
        if (riskTolerance === 'low' && volNum > 3) {
            return 'Consider locking in earlier due to higher volatility and your low risk tolerance.';
        } else if (riskTolerance === 'high' && volNum < 2.5) {
            return 'You can afford to wait longer given lower volatility and your high risk tolerance.';
        } else {
            return 'Current market conditions align well with your risk profile.';
        }
    }

    function calculateLockInDates(settlementDate, riskTolerance, volatility, currencyPair) {
        // Get volatility as number
        const volNum = parseFloat(volatility);
        
        // Calculate days before settlement based on risk tolerance and volatility
        let preferredDaysBefore;
        let leastPreferredDaysBefore;
        
        // Base calculation on risk tolerance
        if (riskTolerance === 'low') {
            // Low risk: lock in earlier (more days before)
            preferredDaysBefore = volNum > 3 ? 12 : 10;
            leastPreferredDaysBefore = 3; // Too close to settlement
        } else if (riskTolerance === 'medium') {
            // Medium risk: balanced approach
            preferredDaysBefore = volNum > 3 ? 14 : 12;
            leastPreferredDaysBefore = 2; // Too close to settlement
        } else {
            // High risk: can wait longer
            preferredDaysBefore = volNum < 2.5 ? 18 : 15;
            leastPreferredDaysBefore = 1; // Very close to settlement
        }
        
        // Adjust based on volatility - higher volatility means earlier preferred date
        if (volNum > 4) {
            preferredDaysBefore += 2;
        } else if (volNum < 2) {
            preferredDaysBefore -= 1;
        }
        
        // Calculate preferred date (subtract days from settlement)
        const preferredDate = new Date(settlementDate);
        preferredDate.setDate(preferredDate.getDate() - preferredDaysBefore);
        
        // Ensure preferred date is not in the past
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (preferredDate < today) {
            // If preferred date is in past, set to tomorrow
            preferredDate.setTime(today.getTime() + 24 * 60 * 60 * 1000);
        }
        
        // Calculate least preferred date (very close to settlement)
        const leastPreferredDate = new Date(settlementDate);
        leastPreferredDate.setDate(leastPreferredDate.getDate() - leastPreferredDaysBefore);
        
        // Ensure least preferred date is not before today
        if (leastPreferredDate < today) {
            leastPreferredDate.setTime(today.getTime());
        }
        
        // Format dates
        const preferredFormatted = preferredDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
        
        const leastPreferredFormatted = leastPreferredDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
        
        return {
            preferred: preferredDate,
            leastPreferred: leastPreferredDate,
            preferredFormatted: preferredFormatted,
            leastPreferredFormatted: leastPreferredFormatted,
            preferredDaysBefore: preferredDaysBefore,
            leastPreferredDaysBefore: leastPreferredDaysBefore
        };
    }

    function estimateFutureRate(currentRate, volatility, daysBefore, dateType) {
        // Estimate future rate based on volatility and historical patterns
        // This simulates what the rate might be on that date based on past trends
        
        // Convert volatility percentage to decimal
        const volDecimal = volatility / 100;
        
        // Calculate expected price movement based on volatility
        // Higher volatility = more potential movement
        // Days before settlement affects uncertainty
        const timeFactor = Math.sqrt(daysBefore / 30); // Square root of time for volatility scaling
        const expectedMovement = volDecimal * timeFactor;
        
        // For preferred date: typically more favorable (slight downward movement for exporter benefit)
        // For least preferred: higher uncertainty, potentially unfavorable
        let rateAdjustment;
        
        if (dateType === 'preferred') {
            // Preferred date: Based on historical analysis, rates tend to be more favorable
            // Slight downward adjustment (0.3 to 0.7% better for exporter)
            const favorableAdjustment = -0.005 * (1 + Math.random() * 0.4); // -0.5% to -0.7%
            rateAdjustment = currentRate * favorableAdjustment;
        } else {
            // Least preferred date: Higher uncertainty, potentially unfavorable
            // Could be 0.5% to 1.5% worse due to last-minute volatility
            const unfavorableAdjustment = 0.008 * (1 + Math.random() * 0.5); // +0.8% to +1.2%
            rateAdjustment = currentRate * unfavorableAdjustment;
        }
        
        // Add some random variation based on volatility
        const randomVariation = (Math.random() - 0.5) * currentRate * expectedMovement * 0.3;
        
        // Calculate estimated rate
        const estimatedRate = currentRate + rateAdjustment + randomVariation;
        
        // Ensure rate is positive and reasonable
        return Math.max(estimatedRate, currentRate * 0.95);
    }

    function calculateRiskPremium(amount, riskTolerance, volatility) {
        // Calculate risk premium based on risk tolerance and volatility
        // Higher risk tolerance and volatility = higher premium
        
        let basePremiumRate;
        
        // Base premium rate based on risk tolerance
        if (riskTolerance === 'low') {
            basePremiumRate = 0.0015; // 0.15% for low risk
        } else if (riskTolerance === 'medium') {
            basePremiumRate = 0.0025; // 0.25% for medium risk
        } else {
            basePremiumRate = 0.004; // 0.4% for high risk
        }
        
        // Adjust based on volatility
        const volatilityAdjustment = (volatility / 100) * 0.5; // Additional 0.5% per 1% volatility
        const totalPremiumRate = basePremiumRate + volatilityAdjustment;
        
        // Calculate risk premium amount
        const riskPremium = amount * totalPremiumRate;
        
        return {
            rate: totalPremiumRate,
            amount: riskPremium
        };
    }

    function calculateFinalAmount(baseAmount, exchangeRate, riskPremium, dateType) {
        // Calculate final amount = (base amount * exchange rate) + risk premium
        
        // For preferred date: slightly lower risk premium (better terms)
        // For least preferred: higher risk premium (worse terms)
        let premiumMultiplier = 1;
        
        if (dateType === 'preferred') {
            premiumMultiplier = 0.9; // 10% discount on risk premium for preferred date
        } else {
            premiumMultiplier = 1.2; // 20% increase in risk premium for least preferred date
        }
        
        const adjustedRiskPremium = riskPremium.amount * premiumMultiplier;
        const finalAmount = (baseAmount * exchangeRate) + adjustedRiskPremium;
        
        return {
            baseAmount: baseAmount,
            exchangeRate: exchangeRate,
            riskPremium: adjustedRiskPremium,
            finalAmount: finalAmount,
            premiumMultiplier: premiumMultiplier
        };
    }

    function displayImporterResults(data) {
        const resultHTML = `
            <div class="forward-contract-result-block">
                <h2>Forward Contract Analysis</h2>

                <div class="forward-contract-result-content">
                    <p>Recommended lock-in window: <strong>${data.idealWindow}</strong>.</p>
                    <p>${data.recommendation}</p>
                </div>

                <div class="forward-contract-lockin-dates-section">
                    <div class="forward-contract-date-card">
                        <div class="forward-contract-date-label">Preferred Execution Date</div>
                        <div class="forward-contract-date-value">${data.preferredDateFormatted}</div>
                        <div class="forward-contract-date-info">Estimated Rate: ${data.preferredDateRate ? data.preferredDateRate.toFixed(4) : 'N/A'}</div>
                        ${data.preferredFinalAmount ? `<div class="forward-contract-date-info">Final Amount: ${formatAmount(data.preferredFinalAmount.finalAmount)}</div>` : ''}
                    </div>

                    <div class="forward-contract-date-card">
                        <div class="forward-contract-date-label">Least Preferred Date</div>
                        <div class="forward-contract-date-value">${data.leastPreferredDateFormatted}</div>
                        <div class="forward-contract-date-info">Estimated Rate: ${data.leastPreferredDateRate ? data.leastPreferredDateRate.toFixed(4) : 'N/A'}</div>
                        ${data.leastPreferredFinalAmount ? `<div class="forward-contract-date-info">Final Amount: ${formatAmount(data.leastPreferredFinalAmount.finalAmount)}</div>` : ''}
                    </div>
                </div>

                <div class="forward-contract-result-details">
                    <p><strong>Amount:</strong> ${formatAmount(data.amount)}</p>
                    <p><strong>Settlement:</strong> ${data.settlementDate}</p>
                    <p><strong>Pair:</strong> ${data.currencyPair}</p>
                    <p><strong>Current Rate:</strong> ${data.currentRate ? data.currentRate.toFixed(4) : 'N/A'}</p>
                    <p><strong>Volatility:</strong> ${data.volatility}</p>
                </div>
            </div>
        `;

        resultsSection.innerHTML = resultHTML;

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'forward-contract-download-pdf-btn';
        downloadBtn.textContent = 'Download Contract Note PDF';
        downloadBtn.onclick = () => generateImporterPDF(data);
        resultsSection.querySelector('.forward-contract-result-block').appendChild(downloadBtn);
        
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function generateImporterPDF(data) {
        if (typeof window.jspdf === 'undefined') {
            alert('PDF library not loaded. Please refresh the page.');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;
        let y = 20;

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(16);
        doc.text("FORWARD CONTRACT NOTE", pageWidth / 2, y, { align: "center" });
        y += 10;

        doc.setLineWidth(0.2);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;

        doc.setFontSize(12);
        doc.text("Contract Details", margin, y); 
        y += 8;

        doc.setFontSize(10);

        function addRow(label, value) {
            doc.setFont("Helvetica", "bold");
            doc.text(label + ":", margin, y);
            doc.setFont("Helvetica", "normal");
            doc.text(String(value), margin + 60, y);
            y += 6;
        }

        function capitalize(x) {
            return x.charAt(0).toUpperCase() + x.slice(1);
        }

        addRow("Currency Pair", data.currencyPair);
        addRow("Contract Amount", formatAmount(data.amount));
        addRow("Settlement Date", data.settlementDate);
        addRow("Current Market Rate", data.currentRate?.toFixed(4) || "N/A");
        addRow("Risk Tolerance", capitalize(data.riskTolerance));
        addRow("Volatility (30-day)", data.volatility);

        y += 5;

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Pricing Summary", margin, y);
        y += 8;
        doc.setFontSize(10);

        if (data.preferredFinalAmount) {
            addRow("Preferred Execution Date", data.preferredDateFormatted);
            addRow("Estimated Rate", data.preferredDateRate.toFixed(4));
            addRow("Final Amount", formatAmount(data.preferredFinalAmount.finalAmount));
            y += 4;
        }

        if (data.leastPreferredFinalAmount) {
            addRow("Least Preferred Date", data.leastPreferredDateFormatted);
            addRow("Estimated Rate", data.leastPreferredDateRate.toFixed(4));
            addRow("Final Amount", formatAmount(data.leastPreferredFinalAmount.finalAmount));
            y += 4;
        }

        y += 5;

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Terms & Disclaimers", margin, y);
        y += 8;

        doc.setFontSize(9);

        const terms = [
            "1. All exchange rates stated herein are indicative and subject to market movements.",
            "2. This document does not constitute financial or legal advice.",
            "3. The client must verify contract details prior to execution.",
            "4. The issuer is not liable for market-driven changes post issuance.",
            "5. This document is system-generated and valid without signature."
        ];

        terms.forEach(t => {
            const lines = doc.splitTextToSize(t, pageWidth - margin * 2);
            doc.text(lines, margin, y);
            y += lines.length * 5;
        });

        y += 15;

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Authorized Signatory", margin, y);
        y += 20;

        doc.setFont("Helvetica", "normal");
        doc.text("______________________________", margin, y); 
        y += 6;
        doc.text("Treasury Operations", margin, y); 
        y += 6;
        doc.text("Issued: " + new Date().toLocaleDateString("en-US"), margin, y);

        const filename = `Forward_Contract_${data.currencyPair.replace("/", "_")}_${new Date().getTime()}.pdf`;
        
        // Convert PDF to Base64
        const pdfBase64 = doc.output('datauristring');
        const pdfBase64Data = pdfBase64.split(',')[1];
        
        // Save PDF locally
        doc.save(filename);
        
        // Save to Firebase Realtime Database
        const importerAuth = window.getImporterAuth ? window.getImporterAuth() : null;
        const importerDatabase = window.getImporterDatabase ? window.getImporterDatabase() : null;
        const currentUserBasePath = window.getCurrentUserBasePath ? window.getCurrentUserBasePath() : '';
        
        if (importerAuth && importerDatabase && importerAuth.currentUser) {
            const user = importerAuth.currentUser;
            const contractId = `contract_${new Date().getTime()}_${Math.random().toString(36).slice(2, 9)}`;
            
            const contractData = {
                id: contractId,
                amount: data.amount,
                settlementDate: data.settlementDate,
                currencyPair: data.currencyPair,
                currentRate: data.currentRate,
                riskTolerance: data.riskTolerance,
                volatility: data.volatility,
                idealWindow: data.idealWindow,
                recommendation: data.recommendation,
                preferredDate: data.preferredDateFormatted,
                preferredDateRate: data.preferredDateRate,
                preferredFinalAmount: data.preferredFinalAmount ? data.preferredFinalAmount.finalAmount : null,
                leastPreferredDate: data.leastPreferredDateFormatted,
                leastPreferredDateRate: data.leastPreferredDateRate,
                leastPreferredFinalAmount: data.leastPreferredFinalAmount ? data.leastPreferredFinalAmount.finalAmount : null,
                riskPremium: data.riskPremium ? {
                    rate: data.riskPremium.rate,
                    amount: data.riskPremium.amount
                } : null,
                pdfBase64: pdfBase64Data,
                pdfFileName: filename,
                createdAt: new Date().toISOString(),
                status: 'active'
            };
            
            try {
                const contractsPath = currentUserBasePath ? `${currentUserBasePath}/forwardContracts/${contractId}` : `importers/${user.uid}/forwardContracts/${contractId}`;
                await importerDatabase.ref(contractsPath).set(contractData);
                console.log('Forward contract saved to Firebase:', contractId);
                
                // Show success message
                const successMsg = document.createElement('div');
                successMsg.className = 'forward-contract-save-success';
                successMsg.style.cssText = 'margin-top: 15px; padding: 12px; background: #d1fae5; color: #065f46; border-radius: 8px; font-size: 14px;';
                successMsg.textContent = '✅ Contract saved successfully! You can view it in the Payments section.';
                resultsSection.querySelector('.forward-contract-result-block').appendChild(successMsg);
                
                // Refresh payment section if it's currently visible
                if (document.getElementById('paymentsSection') && 
                    !document.getElementById('paymentsSection').hasAttribute('hidden')) {
                    loadImporterForwardContractsInPayments();
                }
            } catch (error) {
                console.error('Error saving forward contract to Firebase:', error);
                const errorMsg = document.createElement('div');
                errorMsg.className = 'forward-contract-save-error';
                errorMsg.style.cssText = 'margin-top: 15px; padding: 12px; background: #fee2e2; color: #991b1b; border-radius: 8px; font-size: 14px;';
                errorMsg.textContent = '⚠️ Contract saved locally but failed to save to database. Please try again.';
                resultsSection.querySelector('.forward-contract-result-block').appendChild(errorMsg);
            }
        } else {
            console.warn('Firebase not initialized or user not logged in. Contract saved locally only.');
        }
    }

    function formatAmount(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    }

    async function fetchImporterCurrencyRate(currencyPair) {
        const [baseCurrency, quoteCurrency] = currencyPair.split('/');
        
        currencyPriceDiv.innerHTML = '<span class="rate-label">Loading...</span>';
        currencyPriceDiv.className = 'forward-contract-currency-price loading';

        try {
            let rate;
            
            // If base is USD, fetch directly
            if (baseCurrency === 'USD') {
                rate = await fetchRateFromUSD(quoteCurrency);
            } 
            // If quote is USD, calculate inverse
            else if (quoteCurrency === 'USD') {
                const inverseRate = await fetchRateFromUSD(baseCurrency);
                rate = 1 / inverseRate;
            } 
            // Cross currency pair - calculate from USD rates
            else {
                const baseToUSD = await fetchRateFromUSD(baseCurrency);
                const quoteToUSD = await fetchRateFromUSD(quoteCurrency);
                rate = baseToUSD / quoteToUSD;
            }

            const timestamp = new Date().toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit'
            });

            currencyPriceDiv.innerHTML = `
                <span class="rate-value">${rate.toFixed(4)}</span>
                <span class="rate-label">${currencyPair}</span>
                <span class="refresh-indicator">Updated: ${timestamp}</span>
            `;
            currencyPriceDiv.className = 'forward-contract-currency-price';
        } catch (error) {
            console.error('Error fetching currency rate:', error);
            currencyPriceDiv.innerHTML = '<span class="rate-label">Unable to fetch rate. Please try again.</span>';
            currencyPriceDiv.className = 'forward-contract-currency-price error';
        }
    }

    async function fetchRateFromUSD(currency) {
        // Using exchangerate-api.com free tier (no API key required for basic usage)
        // Fallback to exchangerate.host if first fails
        try {
            const response = await fetch(`https://api.exchangerate-api.com/v4/latest/USD`);
            if (!response.ok) throw new Error('API request failed');
            const data = await response.json();
            
            if (data.rates && data.rates[currency]) {
                return data.rates[currency];
            }
            throw new Error('Currency not found');
        } catch (error) {
            // Fallback to exchangerate.host
            try {
                const response = await fetch(`https://api.exchangerate.host/latest?base=USD&symbols=${currency}`);
                if (!response.ok) throw new Error('Fallback API request failed');
                const data = await response.json();
                
                if (data.rates && data.rates[currency]) {
                    return data.rates[currency];
                }
                throw new Error('Currency not found in fallback');
            } catch (fallbackError) {
                throw new Error('Unable to fetch exchange rate');
            }
        }
    }

    /**
     * Load forward contracts from Firebase and display in payments section
     */
    async function loadImporterForwardContractsInPayments() {
        const contractsList = document.getElementById('importerForwardContractsList');
        const contractsEmpty = document.getElementById('importerForwardContractsEmpty');
        
        if (!contractsList) return;
        
        const importerAuth = window.getImporterAuth ? window.getImporterAuth() : null;
        const importerDatabase = window.getImporterDatabase ? window.getImporterDatabase() : null;
        const currentUserBasePath = window.getCurrentUserBasePath ? window.getCurrentUserBasePath() : '';
        
        if (!importerAuth || !importerDatabase || !importerAuth.currentUser) {
            contractsList.innerHTML = '<div style="text-align: center; padding: 40px; color: #6b7280;">Please log in to view forward contracts.</div>';
            return;
        }
        
        const user = importerAuth.currentUser;
        
        try {
            contractsList.innerHTML = '<div class="forward-contracts-loading" style="text-align: center; padding: 40px;"><div class="spinner" style="border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px;"></div><p>Loading forward contracts...</p></div>';
            
            const contractsPath = currentUserBasePath ? `${currentUserBasePath}/forwardContracts` : `importers/${user.uid}/forwardContracts`;
            const contractsRef = importerDatabase.ref(contractsPath);
            const snapshot = await contractsRef.once('value');
            
            if (!snapshot.exists() || Object.keys(snapshot.val()).length === 0) {
                contractsList.style.display = 'none';
                if (contractsEmpty) contractsEmpty.style.display = 'block';
                return;
            }
            
            const contracts = snapshot.val();
            const contractsArray = Object.keys(contracts).map(key => ({
                id: key,
                ...contracts[key]
            })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            contractsList.innerHTML = '';
            contractsList.style.display = 'grid';
            if (contractsEmpty) contractsEmpty.style.display = 'none';
            
            contractsArray.forEach(contract => {
                const contractCard = createImporterForwardContractCard(contract);
                contractsList.appendChild(contractCard);
            });
            
        } catch (error) {
            console.error('Error loading forward contracts:', error);
            contractsList.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc2626;">Error loading forward contracts. Please try again.</div>';
        }
    }

    /**
     * Create a forward contract card element for importer
     */
    function createImporterForwardContractCard(contract) {
        const card = document.createElement('div');
        card.className = 'forward-contract-card';
        
        const createdAt = new Date(contract.createdAt);
        const formattedDate = createdAt.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const preferredAmount = contract.preferredFinalAmount ? formatAmount(contract.preferredFinalAmount) : 'N/A';
        const settlementDate = contract.settlementDate || 'N/A';
        const currentRate = contract.currentRate ? contract.currentRate.toFixed(4) : 'N/A';
        
        card.innerHTML = `
            <div class="forward-contract-card-header">
                <div>
                    <div class="forward-contract-card-title">Forward Contract - ${contract.currencyPair}</div>
                    <div class="forward-contract-card-date">Created: ${formattedDate}</div>
                </div>
                <span class="forward-contract-card-badge">${contract.status || 'Active'}</span>
            </div>
            <div class="forward-contract-card-details">
                <div class="forward-contract-detail-item">
                    <span class="forward-contract-detail-label">Amount</span>
                    <span class="forward-contract-detail-value">${formatAmount(contract.amount)}</span>
                </div>
                <div class="forward-contract-detail-item">
                    <span class="forward-contract-detail-label">Settlement Date</span>
                    <span class="forward-contract-detail-value">${settlementDate}</span>
                </div>
                <div class="forward-contract-detail-item">
                    <span class="forward-contract-detail-label">Currency Pair</span>
                    <span class="forward-contract-detail-value">${contract.currencyPair}</span>
                </div>
                <div class="forward-contract-detail-item">
                    <span class="forward-contract-detail-label">Current Rate</span>
                    <span class="forward-contract-detail-value">${currentRate}</span>
                </div>
                <div class="forward-contract-detail-item">
                    <span class="forward-contract-detail-label">Preferred Final Amount</span>
                    <span class="forward-contract-detail-value">${preferredAmount}</span>
                </div>
                <div class="forward-contract-detail-item">
                    <span class="forward-contract-detail-label">Risk Tolerance</span>
                    <span class="forward-contract-detail-value">${contract.riskTolerance ? contract.riskTolerance.charAt(0).toUpperCase() + contract.riskTolerance.slice(1) : 'N/A'}</span>
                </div>
            </div>
            <div class="forward-contract-card-actions">
                <button class="forward-contract-action-btn forward-contract-action-btn-primary" onclick="downloadImporterForwardContractPDF('${contract.id}')">
                    <span>📄</span>
                    <span>Download PDF</span>
                </button>
                <button class="forward-contract-action-btn forward-contract-action-btn-secondary" onclick="viewImporterForwardContractDetails('${contract.id}')">
                    <span>👁️</span>
                    <span>View Details</span>
                </button>
            </div>
        `;
        
        return card;
    }

    /**
     * Download forward contract PDF from Firebase for importer
     */
    async function downloadImporterForwardContractPDF(contractId) {
        const importerAuth = window.getImporterAuth ? window.getImporterAuth() : null;
        const importerDatabase = window.getImporterDatabase ? window.getImporterDatabase() : null;
        const currentUserBasePath = window.getCurrentUserBasePath ? window.getCurrentUserBasePath() : '';
        
        if (!importerAuth || !importerDatabase || !importerAuth.currentUser) {
            alert('Please log in to download the contract.');
            return;
        }
        
        const user = importerAuth.currentUser;
        
        try {
            const contractsPath = currentUserBasePath ? `${currentUserBasePath}/forwardContracts/${contractId}` : `importers/${user.uid}/forwardContracts/${contractId}`;
            const contractRef = importerDatabase.ref(contractsPath);
            const snapshot = await contractRef.once('value');
            
            if (!snapshot.exists()) {
                alert('Contract not found.');
                return;
            }
            
            const contract = snapshot.val();
            
            if (!contract.pdfBase64) {
                alert('PDF data not available for this contract.');
                return;
            }
            
            // Convert Base64 to blob and download
            const pdfData = contract.pdfBase64;
            const byteCharacters = atob(pdfData);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/pdf' });
            
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = contract.pdfFileName || `Forward_Contract_${contractId}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('Error downloading PDF:', error);
            alert('Error downloading PDF. Please try again.');
        }
    }

    /**
     * View forward contract details for importer
     */
    async function viewImporterForwardContractDetails(contractId) {
        const importerAuth = window.getImporterAuth ? window.getImporterAuth() : null;
        const importerDatabase = window.getImporterDatabase ? window.getImporterDatabase() : null;
        const currentUserBasePath = window.getCurrentUserBasePath ? window.getCurrentUserBasePath() : '';
        
        if (!importerAuth || !importerDatabase || !importerAuth.currentUser) {
            alert('Please log in to view contract details.');
            return;
        }
        
        const user = importerAuth.currentUser;
        
        try {
            const contractsPath = currentUserBasePath ? `${currentUserBasePath}/forwardContracts/${contractId}` : `importers/${user.uid}/forwardContracts/${contractId}`;
            const contractRef = importerDatabase.ref(contractsPath);
            const snapshot = await contractRef.once('value');
            
            if (!snapshot.exists()) {
                alert('Contract not found.');
                return;
            }
            
            const contract = snapshot.val();
            
            // Create a modal or alert with contract details
            const details = `
Forward Contract Details

Amount: ${formatAmount(contract.amount)}
Settlement Date: ${contract.settlementDate}
Currency Pair: ${contract.currencyPair}
Current Rate: ${contract.currentRate ? contract.currentRate.toFixed(4) : 'N/A'}
Risk Tolerance: ${contract.riskTolerance ? contract.riskTolerance.charAt(0).toUpperCase() + contract.riskTolerance.slice(1) : 'N/A'}
Volatility: ${contract.volatility || 'N/A'}
Ideal Window: ${contract.idealWindow || 'N/A'}
Preferred Date: ${contract.preferredDate || 'N/A'}
Preferred Date Rate: ${contract.preferredDateRate ? contract.preferredDateRate.toFixed(4) : 'N/A'}
Preferred Final Amount: ${contract.preferredFinalAmount ? formatAmount(contract.preferredFinalAmount) : 'N/A'}
Least Preferred Date: ${contract.leastPreferredDate || 'N/A'}
Least Preferred Date Rate: ${contract.leastPreferredDateRate ? contract.leastPreferredDateRate.toFixed(4) : 'N/A'}
Least Preferred Final Amount: ${contract.leastPreferredFinalAmount ? formatAmount(contract.leastPreferredFinalAmount) : 'N/A'}
Risk Premium Rate: ${contract.riskPremium && contract.riskPremium.rate ? (contract.riskPremium.rate * 100).toFixed(2) + '%' : 'N/A'}
Recommendation: ${contract.recommendation || 'N/A'}
Created: ${new Date(contract.createdAt).toLocaleString()}
            `;
            
            alert(details);
            
        } catch (error) {
            console.error('Error viewing contract details:', error);
            alert('Error loading contract details. Please try again.');
        }
    }

    // Make functions globally available
    window.downloadImporterForwardContractPDF = downloadImporterForwardContractPDF;
    window.viewImporterForwardContractDetails = viewImporterForwardContractDetails;
});

