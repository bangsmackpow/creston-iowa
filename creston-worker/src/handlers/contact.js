/**
 * src/handlers/contact.js
 * Handles the contact form page and POST submission.
 * Uses Resend API for email delivery.
 *
 * Required secret:
 *   npx wrangler secret put RESEND_API_KEY
 *
 * Required var in wrangler.toml:
 *   CONTACT_EMAIL = "hello@creston-iowa.com"
 */

import { renderShell, escHtml as escapeHtml, adSlot } from '../shell.js';

export async function handleContact(request, env, url) {
  if (request.method === 'POST') {
    return processContactForm(request, env);
  }
  return renderContactPage(env, null, null);
}

// ── Process form submission ────────────────────────────────────
async function processContactForm(request, env) {
  let body;
  const contentType = request.headers.get('Content-Type') || '';

  try {
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      const fd = await request.formData();
      body = {
        name:    fd.get('name')    || '',
        email:   fd.get('email')   || '',
        subject: fd.get('subject') || '',
        message: fd.get('message') || '',
        phone:   fd.get('phone')   || '',
        type:    fd.get('type')    || 'General',
      };
    }
  } catch {
    return renderContactPage(env, null, 'Could not read form data. Please try again.');
  }

  // Validate
  const { name, email, subject, message, type } = body;
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return renderContactPage(env, body, 'Name, email, and message are required.');
  }
  if (!isValidEmail(email)) {
    return renderContactPage(env, body, 'Please enter a valid email address.');
  }
  if (message.trim().length < 10) {
    return renderContactPage(env, body, 'Message is too short — please provide more detail.');
  }

  // Honeypot spam check
  if (body.website_url) {
    // Bot filled the hidden field — silently succeed
    return renderContactPage(env, null, null, true);
  }

  // Send via Resend
  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set');
    return renderContactPage(env, body, 'Email service not configured. Please email us directly at hello@creston-iowa.com.');
  }

  const toEmail   = env.CONTACT_EMAIL || 'hello@creston-iowa.com';
  const fromEmail = env.CONTACT_FROM  || 'contact@creston-iowa.com';

  try {
    const emailHtml = buildEmailHtml({ name, email, subject, message, type, phone: body.phone });

    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:     `Creston Iowa Contact <${fromEmail}>`,
        to:       [toEmail],
        reply_to: email,
        subject:  `[Creston Iowa] ${type}: ${subject || 'New message from ' + name}`,
        html:     emailHtml,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return renderContactPage(env, body, 'Failed to send message. Please email us directly at hello@creston-iowa.com.');
    }

    // Send confirmation to the sender
    await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    `Creston, Iowa <${fromEmail}>`,
        to:      [email],
        subject: 'We received your message — Creston, Iowa',
        html:    buildConfirmationHtml(name, type),
      }),
    });

    return renderContactPage(env, null, null, true);

  } catch (err) {
    console.error('Contact form error:', err);
    return renderContactPage(env, body, 'An unexpected error occurred. Please try again or email us directly.');
  }
}

// ── Render contact page ────────────────────────────────────────
function renderContactPage(env, prefill = null, error = null, success = false) {
  const p = prefill || {};

  const content = `
    <section class="section">
      <div class="container">
        <div class="layout-sidebar">
          <div>
            ${success ? `
              <div class="contact-success">
                <div class="success-icon">✅</div>
                <h2>Message Sent!</h2>
                <p>Thanks for reaching out. We'll get back to you shortly. Check your inbox for a confirmation email.</p>
                <a href="/" class="btn btn-primary mt-2">Back to Home</a>
              </div>
            ` : `
              ${error ? `<div class="alert-box alert-err" style="margin-bottom:24px;">❌ ${escapeHtml(error)}</div>` : ''}

              <div class="contact-form-card">
                <h2 style="margin-bottom:6px;">Send a Message</h2>
                <p style="color:var(--text-muted);font-size:.92rem;margin-bottom:28px;">
                  Whether you have news to share, a business to list, or just want to say hello — we'd love to hear from you.
                </p>

                <form id="contact-form" method="POST" action="/contact">
                  <!-- Honeypot — hidden from real users -->
                  <input type="text" name="website_url" style="display:none;" tabindex="-1" autocomplete="off">

                  <div class="form-grid-2">
                    <div class="form-group">
                      <label class="form-label">Your Name *</label>
                      <input type="text" name="name" class="form-input" required
                             value="${escapeHtml(p.name||'')}" placeholder="First Last">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Email Address *</label>
                      <input type="email" name="email" class="form-input" required
                             value="${escapeHtml(p.email||'')}" placeholder="you@example.com">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Phone (optional)</label>
                      <input type="tel" name="phone" class="form-input"
                             value="${escapeHtml(p.phone||'')}" placeholder="(641) 555-1234">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Topic *</label>
                      <select name="type" class="form-select">
                        ${[
                          'General Question',
                          'Submit a News Tip',
                          'List a Business',
                          'Advertising Inquiry',
                          'Job Board — Post a Job',
                          'Report a Correction',
                          'Event Submission',
                          'Other',
                        ].map(t => `<option value="${t}" ${(p.type||'')=== t ? 'selected':''}>${t}</option>`).join('')}
                      </select>
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                      <label class="form-label">Subject</label>
                      <input type="text" name="subject" class="form-input"
                             value="${escapeHtml(p.subject||'')}" placeholder="Brief subject line">
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                      <label class="form-label">Message *</label>
                      <textarea name="message" class="form-textarea" rows="6" required
                                placeholder="Tell us what's on your mind...">${escapeHtml(p.message||'')}</textarea>
                    </div>
                  </div>

                  <div class="form-actions">
                    <button type="submit" class="btn btn-primary btn-lg" id="submit-btn">
                      Send Message
                    </button>
                    <p style="font-size:.78rem;color:var(--text-muted);font-family:var(--font-ui);margin:0;">
                      Or email directly: <a href="mailto:hello@creston-iowa.com">hello@creston-iowa.com</a>
                    </p>
                  </div>
                </form>
              </div>
            `}
          </div>

          <aside>
            <div class="sidebar-widget" style="margin-bottom:20px;">
              <div class="widget-header">📬 Contact by Topic</div>
              <div class="widget-body">
                <div class="info-block">
                  <div class="info-icon">📰</div>
                  <div><h4>News Tips</h4><p><a href="mailto:news@creston-iowa.com">news@creston-iowa.com</a></p></div>
                </div>
                <div class="info-block">
                  <div class="info-icon">💼</div>
                  <div><h4>Job Board</h4><p><a href="mailto:jobs@creston-iowa.com">jobs@creston-iowa.com</a></p></div>
                </div>
                <div class="info-block">
                  <div class="info-icon">📢</div>
                  <div><h4>Advertising</h4><p><a href="mailto:advertise@creston-iowa.com">advertise@creston-iowa.com</a></p></div>
                </div>
                <div class="info-block" style="border:none;">
                  <div class="info-icon">✉️</div>
                  <div><h4>General</h4><p><a href="mailto:hello@creston-iowa.com">hello@creston-iowa.com</a></p></div>
                </div>
              </div>
            </div>

            <div class="sidebar-widget" style="margin-bottom:20px;">
              <div class="widget-header">🏛️ City & Emergency</div>
              <div class="widget-body">
                <div class="info-block">
                  <div class="info-icon" style="background:#fde8e8;color:#b84040;">🚨</div>
                  <div><h4>Emergency</h4><p><strong><a href="tel:911">911</a></strong></p></div>
                </div>
                <div class="info-block">
                  <div class="info-icon">🚔</div>
                  <div><h4>Police Non-Emergency</h4><p><a href="tel:6417828402">(641) 782-8402</a></p></div>
                </div>
                <div class="info-block" style="border:none;">
                  <div class="info-icon">🏛️</div>
                  <div><h4>City Hall</h4><p><a href="https://www.crestoniowa.gov" target="_blank">crestoniowa.gov</a></p></div>
                </div>
              </div>
            </div>

            ${adSlot('square')}
          </aside>
        </div>
      </div>
    </section>

    <style>
      .contact-form-card {
        background: var(--white);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: 36px;
        box-shadow: var(--shadow-sm);
      }
      .form-grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 24px;
      }
      .form-group { display: flex; flex-direction: column; gap: 6px; }
      .form-textarea {
        padding: 10px 14px;
        border: 1.5px solid var(--border);
        border-radius: var(--radius-sm);
        font-family: var(--font-body);
        font-size: .95rem;
        resize: vertical;
        transition: border-color .18s;
      }
      .form-textarea:focus { outline: none; border-color: var(--green-mid); box-shadow: 0 0 0 3px rgba(45,90,61,.1); }
      .form-select {
        padding: 10px 14px;
        border: 1.5px solid var(--border);
        border-radius: var(--radius-sm);
        font-family: var(--font-ui);
        font-size: .9rem;
        background: white;
      }
      .form-select:focus { outline: none; border-color: var(--green-mid); }
      .form-actions { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
      .contact-success {
        background: var(--green-pale);
        border: 2px solid var(--green-light);
        border-radius: var(--radius-lg);
        padding: 60px 40px;
        text-align: center;
      }
      .success-icon { font-size: 3rem; margin-bottom: 16px; }
      .contact-success h2 { margin-bottom: 12px; }
      .contact-success p { color: var(--text-muted); font-style: italic; max-width: 440px; margin: 0 auto; }
      .alert-box { border-radius: var(--radius-sm); padding: 14px 18px; font-family: var(--font-ui); font-size: .9rem; }
      .alert-err { background: #fde8e8; border: 1.5px solid #e0a0a0; color: #b84040; }
      @media (max-width: 640px) {
        .form-grid-2 { grid-template-columns: 1fr; }
        .contact-form-card { padding: 20px; }
        .form-actions { flex-direction: column; align-items: flex-start; }
      }
    </style>

    <script>
      const form = document.getElementById('contact-form');
      const btn  = document.getElementById('submit-btn');
      if (form) {
        form.addEventListener('submit', () => {
          if (btn) {
            btn.textContent = 'Sending...';
            btn.disabled = true;
          }
        });
      }
    </script>`;

  return new Response(renderShell({
    title:       'Contact Us',
    description: 'Get in touch with creston-iowa.com — submit news tips, advertising inquiries, business listings, or general questions.',
    eyebrow:     '✉️ Get in Touch',
    heading:     'Contact Creston Iowa',
    subheading:  'News tips, advertising, business listings, or just saying hello — we want to hear from you.',
    activeNav:   'Contact',
    env,
    content,
  }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// ── Email templates ────────────────────────────────────────────
function buildEmailHtml({ name, email, subject, message, type, phone }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body { font-family: -apple-system, sans-serif; color: #333; max-width: 600px; margin: 0 auto; }
  .header { background: #1a3a2a; color: white; padding: 24px 32px; border-radius: 8px 8px 0 0; }
  .header h1 { margin: 0; font-size: 1.2rem; }
  .header p  { margin: 4px 0 0; opacity: .7; font-size: .85rem; }
  .body   { background: #f9f9f9; padding: 28px 32px; border: 1px solid #ddd; }
  .field  { margin-bottom: 18px; }
  .label  { font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #888; margin-bottom: 4px; }
  .value  { font-size: .95rem; color: #222; background: white; border: 1px solid #ddd; border-radius: 6px; padding: 10px 14px; }
  .message-value { white-space: pre-wrap; line-height: 1.7; }
  .footer { background: #f0f0f0; padding: 14px 32px; border-radius: 0 0 8px 8px; font-size: .78rem; color: #888; border: 1px solid #ddd; border-top: none; }
  .tag { display: inline-block; background: #c9933a; color: white; padding: 2px 10px; border-radius: 100px; font-size: .72rem; font-weight: 700; }
</style></head>
<body>
  <div class="header">
    <h1>🌾 New Contact Form Submission</h1>
    <p>creston-iowa.com</p>
  </div>
  <div class="body">
    <div class="field">
      <div class="label">Topic</div>
      <div class="value"><span class="tag">${escapeHtml(type)}</span></div>
    </div>
    <div class="field">
      <div class="label">From</div>
      <div class="value">${escapeHtml(name)} &lt;<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>&gt;</div>
    </div>
    ${phone ? `<div class="field"><div class="label">Phone</div><div class="value">${escapeHtml(phone)}</div></div>` : ''}
    ${subject ? `<div class="field"><div class="label">Subject</div><div class="value">${escapeHtml(subject)}</div></div>` : ''}
    <div class="field">
      <div class="label">Message</div>
      <div class="value message-value">${escapeHtml(message)}</div>
    </div>
  </div>
  <div class="footer">
    Sent from the contact form at creston-iowa.com · Reply directly to this email to respond to ${escapeHtml(name)}.
  </div>
</body>
</html>`;
}

function buildConfirmationHtml(name, type) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body { font-family: -apple-system, sans-serif; color: #333; max-width: 600px; margin: 0 auto; }
  .header { background: #1a3a2a; color: white; padding: 32px; border-radius: 8px 8px 0 0; text-align: center; }
  .header h1 { margin: 0 0 8px; font-size: 1.4rem; }
  .header p  { margin: 0; opacity: .75; }
  .body   { background: white; padding: 32px; border: 1px solid #ddd; text-align: center; }
  .body h2 { color: #1a3a2a; margin-bottom: 12px; }
  .body p  { color: #666; line-height: 1.7; margin-bottom: 16px; }
  .btn    { display: inline-block; background: #2d5a3d; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; }
  .footer { background: #f5f5f5; padding: 16px 32px; border-radius: 0 0 8px 8px; font-size: .78rem; color: #999; text-align: center; border: 1px solid #ddd; border-top: none; }
</style></head>
<body>
  <div class="header">
    <h1>🌾 Creston, Iowa</h1>
    <p>The Crest of Iowa</p>
  </div>
  <div class="body">
    <h2>Got your message, ${escapeHtml(name)}!</h2>
    <p>Thanks for reaching out about <strong>${escapeHtml(type)}</strong>. We've received your message and will get back to you as soon as possible — usually within 1–2 business days.</p>
    <p>In the meantime, explore what's happening in Creston:</p>
    <a href="https://creston-iowa.com" class="btn">Visit Creston Iowa →</a>
  </div>
  <div class="footer">
    You're receiving this because you submitted the contact form at creston-iowa.com.<br>
    If you didn't do this, please ignore this email.
  </div>
</body>
</html>`;
}

// ── Utilities ──────────────────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
