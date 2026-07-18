document.addEventListener('DOMContentLoaded', function () {
    // ---------- API CONFIG ----------
    // On localhost we talk to the local backend. In production (Netlify),
    // set window.SNAPLINK_API in code.html or replace PROD_API_URL below
    // with your Render backend URL.
    const PROD_API_URL = "https://snaplink-backend.onrender.com/api";
    const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
    const API_URL = window.SNAPLINK_API
        || (isLocal ? "http://localhost:5000/api" : PROD_API_URL);

    // Base URL for building full short links (API_URL without the trailing /api)
    const SHORT_BASE = API_URL.replace(/\/api\/?$/, '');

    let links = [];
    let currentQrDataUrl = '';

    // ---------- HELPERS ----------
    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    function fullShortUrl(link) {
        if (link.shortUrl) return link.shortUrl;
        if (link.shortCode) return `${SHORT_BASE}/${link.shortCode}`;
        return '';
    }

    function displayShort(link) {
        // Show just host/code, not the protocol, for a cleaner chip
        return fullShortUrl(link).replace(/^https?:\/\//, '');
    }

    // ---------- LOAD LINKS FROM BACKEND ----------
    async function loadLinks() {
        try {
            const response = await fetch(`${API_URL}/links`);
            const result = await response.json();

            if (!result.success) {
                console.log('Failed to load links:', result.message);
                return;
            }

            links = result.data;
            renderLinks(links);
            updateStats(links);

        } catch (error) {
            console.log('Error loading links:', error);
        }
    }

    // ---------- RENDER LINKS (unified responsive list) ----------
    function renderLinks(data) {
        const container = document.getElementById('linksList');
        const countEl = document.getElementById('linksCount');
        if (!container) return;

        if (countEl) countEl.textContent = data ? data.length : 0;

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="links-empty glass-card">
                    <span class="material-symbols-outlined">link_off</span>
                    <p class="links-empty-title">No links yet</p>
                    <p class="links-empty-sub">Shorten a URL above and it'll show up here.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = data.map(link => {
            const dest = link.originalUrl
                ? escapeHtml(link.originalUrl.replace(/^https?:\/\//, ''))
                : 'Unknown';
            const shortText = escapeHtml(displayShort(link));
            const shortHref = escapeHtml(fullShortUrl(link));
            const initial = (dest[0] || '?').toUpperCase();

            return `
            <article class="link-card glass-card" data-id="${escapeHtml(link._id)}">
                <div class="link-card-avatar" aria-hidden="true">${escapeHtml(initial)}</div>

                <div class="link-card-main">
                    <a class="link-card-short" href="${shortHref}" target="_blank" rel="noopener noreferrer" title="${shortHref}">
                        <span class="material-symbols-outlined">link</span>
                        <span class="link-card-short-text">${shortText}</span>
                    </a>
                    <div class="link-card-dest" title="${dest}">${dest}</div>
                </div>

                <div class="link-card-clicks" title="${formatNumber(link.clicks || 0)} clicks">
                    <span class="link-card-clicks-value">${formatNumber(link.clicks || 0)}</span>
                    <span class="link-card-clicks-label">clicks</span>
                </div>

                <div class="link-card-actions">
                    <button class="icon-btn copy-link-btn" data-url="${shortHref}" aria-label="Copy short link" title="Copy link">
                        <span class="material-symbols-outlined">content_copy</span>
                    </button>
                    <button class="icon-btn delete-btn" data-id="${escapeHtml(link._id)}" aria-label="Delete link" title="Delete">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </article>`;
        }).join('');

        // Delete handlers
        container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteLink(btn.dataset.id));
        });

        // Copy handlers
        container.querySelectorAll('.copy-link-btn').forEach(btn => {
            btn.addEventListener('click', () => copyToClipboard(btn.dataset.url, btn));
        });
    }

    // ---------- COPY TO CLIPBOARD (shared) ----------
    function copyToClipboard(text, btn) {
        if (!text) return;
        const done = () => {
            if (!btn) return;
            const icon = btn.querySelector('.material-symbols-outlined');
            const original = icon.textContent;
            icon.textContent = 'check';
            btn.classList.add('copied');
            setTimeout(() => { icon.textContent = original; btn.classList.remove('copied'); }, 1600);
        };
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else {
            fallbackCopy(text, done);
        }
    }

    function fallbackCopy(text, done) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done && done(); } catch (e) { /* noop */ }
        document.body.removeChild(ta);
    }

    // ---------- UPDATE STATS ----------
    function updateStats(data) {
        const totalLinks = data?.length || 0;
        const totalClicks = data?.reduce((sum, link) => sum + (link.clicks || 0), 0) || 0;
        const qrCodes = data?.filter(link => link.has_qr).length || 0;

        const statValues = document.querySelectorAll('.stat-value');
        if (statValues.length >= 3) {
            statValues[0].textContent = formatNumber(totalLinks);
            statValues[1].textContent = formatNumber(totalClicks);
            statValues[2].textContent = formatNumber(qrCodes);
        }
    }

    // ---------- DELETE LINK ----------
    async function deleteLink(id) {
        if (!confirm('Delete this link?')) return;
        
        try {
            const response = await fetch(`${API_URL}/links/${id}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                await loadLinks();
            } else {
                alert(result.message || 'Failed to delete link');
            }
        } catch (error) {
            console.error('Error deleting link:', error);
            alert('Server Error');
        }
    }

    // ---------- SHORTEN URL ----------
    async function shortenUrl(longUrl) {
        try {
            const response = await fetch(`${API_URL}/shorten`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    originalUrl: longUrl
                })
            });

            const result = await response.json();

            if (!result.success) {
                alert(result.message || 'Failed to shorten URL');
                return;
            }

            // Show full short URL (falls back to code if not provided)
            const shortLink = result.shortUrl || result.shortCode || '';
            document.querySelector('.result-link').textContent = shortLink;

            // Show QR Code if available
            const qrImage = document.getElementById('qrImage');
            const qrPlaceholder = document.querySelector('.qr-svg');
            if (result.qrCode) {
                currentQrDataUrl = result.qrCode;
                qrImage.src = result.qrCode;
                qrImage.style.display = 'block';
                if (qrPlaceholder) qrPlaceholder.style.display = 'none';
            }

            // Show Result Card
            document.querySelector('.result-section').classList.add('is-visible');

            // Scroll to Result
            setTimeout(() => {
                document.querySelector('.result-section').scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }, 300);

            // Clear Input
            document.getElementById('urlInput').value = '';

            // Reload links list
            await loadLinks();

        } catch (error) {
            console.error('Error shortening URL:', error);
            alert('Server Error. Please try again.');
        }
    }

    // ---------- UTILITY FUNCTIONS ----------
    function formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        }
        return num;
    }

    // ---------- EVENT LISTENERS ----------

    // Copy button (result card)
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', function () {
            const linkText = document.querySelector('.result-link')?.textContent || '';
            copyToClipboard(linkText, this);
        });
    }

    // Shorten button
    const shortenBtn = document.getElementById('shortenBtn');
    const urlInput = document.getElementById('urlInput');
    if (shortenBtn && urlInput) {
        urlInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                shortenBtn.click();
            }
        });

        const form = document.querySelector('.url-form');
        const flagInvalid = () => {
            if (!form) return;
            form.classList.add('invalid');
            setTimeout(() => form.classList.remove('invalid'), 1200);
        };

        shortenBtn.addEventListener('click', function () {
            const url = urlInput.value.trim();
            if (!url) {
                urlInput.focus();
                flagInvalid();
                return;
            }

            // Validate URL
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                flagInvalid();
                alert('Please enter a valid URL (include https://)');
                return;
            }

            shortenUrl(url);
        });
    }

    // Download QR button
    const downloadBtn = document.getElementById('downloadQrBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function () {
            if (!currentQrDataUrl) return;
            const a = document.createElement('a');
            a.href = currentQrDataUrl;
            a.download = 'snaplink-qr.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    }

    // Mobile menu toggle
    const menuIcon = document.getElementById('menuToggle');
    const navLinks = document.getElementById('navLinks');
    if (menuIcon && navLinks) {
        menuIcon.addEventListener('click', function () {
            const isOpen = navLinks.classList.toggle('open');
            menuIcon.setAttribute('aria-expanded', String(isOpen));
        });
        // Close menu when a link is tapped
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('open');
                menuIcon.setAttribute('aria-expanded', 'false');
            });
        });
    }

    // View All button
    const viewAllBtn = document.getElementById('viewAllBtn');
    if (viewAllBtn) {
        viewAllBtn.addEventListener('click', function() {
            document.querySelector('.links-section')?.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Share button (native share sheet, with clipboard fallback)
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async function (e) {
            e.preventDefault();

            const shareData = {
                title: 'SnapLink',
                text: 'Shorten your links fast with SnapLink.',
                url: window.location.href
            };

            if (navigator.share) {
                try {
                    await navigator.share(shareData);
                } catch (err) {
                    // User cancelled the share sheet, or it failed — ignore silently
                    if (err && err.name !== 'AbortError') {
                        console.log('Share failed:', err);
                    }
                }
            } else {
                // Fallback: copy the link so the user can paste it anywhere
                copyToClipboard(shareData.url, this);
                alert('Link copied to clipboard!');
            }
        });
    }

    // ---------- LOAD DATA ON PAGE LOAD ----------
    loadLinks();

});