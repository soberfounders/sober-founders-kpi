import "../app/test/homepage.css";

/* eslint-disable @next/next/no-img-element */

export default function HomepageContent() {
  return (
    <div className="sf-page">

      {/* ─── WHAT IS SOBER FOUNDERS? ─── */}
      <div className="sf-section">
        <div className="sf-definition">
          <h2>What is Sober Founders?</h2>
          <p>Sober Founders is a 501(c)(3) nonprofit community for entrepreneurs in recovery from addiction. Founded in 2024 after a successful exit, our creator knew there had to be a way to bridge the gap between sobriety and business&mdash;and set out to dedicate his next chapter to bringing together like-minded, successful sober entrepreneurs.</p>
          <p>Our members represent over $500 million in combined revenue across all industries. We provide free weekly mastermind sessions, peer support, and the Phoenix Forum&mdash;an exclusive peer advisory board for founders with $1M+ in annual revenue and 1+ year of sobriety.</p>
        </div>
      </div>

      {/* ─── STATS ─── */}
      <div className="sf-section-sm sf-pad-wrap">
        <div className="sf-stats-section">
          <div className="sf-stats-grid">
            <div className="sf-stat">
              <div className="sf-stat-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M144 0a80 80 0 1 1 0 160A80 80 0 1 1 144 0zM512 0a80 80 0 1 1 0 160A80 80 0 1 1 512 0zM0 298.7C0 239.8 47.8 192 106.7 192h42.7c15.9 0 31 3.5 44.6 9.7c-1.3 7.2-1.9 14.7-1.9 22.3c0 38.2 16.8 72.5 43.3 96H21.3C9.6 320 0 310.4 0 298.7zM405.3 320H235.4c26.5-23.5 43.3-57.8 43.3-96c0-7.6-.7-15-1.9-22.3c13.6-6.3 28.7-9.7 44.6-9.7h42.7C423.2 192 471 239.8 471 298.7c0 11.8-9.6 21.3-21.3 21.3h-44.3zM320 256a96 96 0 1 0 0-192 96 96 0 1 0 0 192zm-94.8 32c-47 0-87.9 26.2-108.8 64.8C100.2 378.7 92.9 400.8 86.5 432H553.5c-6.4-31.2-13.7-53.3-29.9-79.2C502.7 314.2 461.8 288 414.8 288H225.2z"/></svg>
              </div>
              <div className="sf-stat-num">500+</div>
              <div className="sf-stat-label">Entrepreneurs Helped</div>
            </div>
            <div className="sf-stat">
              <div className="sf-stat-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M64 64C28.7 64 0 92.7 0 128V384c0 35.3 28.7 64 64 64H512c35.3 0 64-28.7 64-64V128c0-35.3-28.7-64-64-64H64zm64 160c-8.8 0-16-7.2-16-16s7.2-16 16-16h16c44.2 0 80 35.8 80 80v16c0 8.8-7.2 16-16 16s-16-7.2-16-16V272c0-26.5-21.5-48-48-48H128zm224-16c0-8.8 7.2-16 16-16h16c26.5 0 48 21.5 48 48v16c0 8.8-7.2 16-16 16s-16-7.2-16-16V256c0-8.8-7.2-16-16-16H368c-8.8 0-16-7.2-16-16zm-160 32a64 64 0 1 1 128 0 64 64 0 1 1-128 0zM288 160a80 80 0 1 1 0 160 80 80 0 1 1 0-160z"/></svg>
              </div>
              <div className="sf-stat-num">$500M+</div>
              <div className="sf-stat-label">Combined Member Revenue</div>
            </div>
            <div className="sf-stat">
              <div className="sf-stat-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M470.7 9.4c3 3.1 5.3 6.6 6.9 10.3s2.4 7.8 2.4 12.2V128c0 17.7-14.3 32-32 32s-32-14.3-32-32V109.3L310.6 214.6c-12.5 12.5-32.8 12.5-45.3 0L192 141.3 54.6 278.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l160-160c12.5-12.5 32.8-12.5 45.3 0L288 146.7 383.4 51.3H352c-17.7 0-32-14.3-32-32s14.3-32 32-32h96c8.8 0 16.8 3.6 22.6 9.3l.1 .1z"/></svg>
              </div>
              <div className="sf-stat-num">$1M+</div>
              <div className="sf-stat-label">Additional Revenue Generated for Members</div>
            </div>
            <div className="sf-stat">
              <div className="sf-stat-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M47.6 300.4L228.3 469.1c7.5 7 17.4 10.9 27.7 10.9s20.2-3.9 27.7-10.9L464.4 300.4c30.4-28.3 47.6-68 47.6-109.5v-5.8c0-69.9-50.5-129.5-119.4-141C347 36.5 300.6 51.4 268 84L256 96 244 84c-32.6-32.6-79-47.5-124.6-39.9C50.5 55.6 0 115.2 0 185.1v5.8c0 41.5 17.2 81.2 47.6 109.5z"/></svg>
              </div>
              <div className="sf-stat-num">98%</div>
              <div className="sf-stat-label">Say We Helped Them Stay Sober Longer</div>
            </div>
            <div className="sf-stat">
              <a href="/events/" className="block" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="sf-stat-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z"/></svg>
                </div>
                <div className="sf-stat-num">2x Weekly</div>
                <div className="sf-stat-label">Tuesday &amp; Thursday Sessions</div>
              </a>
            </div>
            <div className="sf-stat">
              <a href="/donate/" className="block" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="sf-stat-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z"/></svg>
                </div>
                <div className="sf-stat-num">501(c)(3)</div>
                <div className="sf-stat-label">EIN: 33-4098435</div>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ─── DIVIDER ─── */}
      <div style={{ padding: "40px 0" }}>
        <div className="sf-divider">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M208 32a48 48 0 0 0-96 0v16H64C28.7 48 0 76.7 0 112v48H512V112c0-35.3-28.7-64-64-64H400V32a48 48 0 0 0-96 0v16H208V32zM0 192V464c0 26.5 21.5 48 48 48H464c26.5 0 48-21.5 48-48V192H0z"/></svg>
        </div>
      </div>

      {/* ─── HOW WE SUPPORT FOUNDERS ─── */}
      <div className="sf-section">
        <div className="sf-services-heading">
          <h2>How We Support Founders</h2>
          <p>Four tiers of community&mdash;from open masterminds to an exclusive peer advisory board&mdash;so you can find your fit.</p>
        </div>

        <div className="sf-svc-grid">
          {/* 01 — Thursday Open Mastermind */}
          <div className="sf-svc-card">
            <div className="sf-svc-card-body">
              <div className="sf-svc-card-num">01</div>
              <h3>Thursday Open Mastermind</h3>
              <p>Open to any sober entrepreneur. Show up, share what&apos;s real, and get honest feedback from peers who understand the intersection of business pressure and recovery. No application required&mdash;just be sober and own a business.</p>
              <span className="sf-tag sf-tag-free">Free &bull; Open to All</span>
              <a href="/events/" className="sf-svc-card-link">View Upcoming Events</a>
            </div>
          </div>

          {/* 02 — All Our Affairs Mastermind (Tuesday) */}
          <div className="sf-svc-card">
            <div className="sf-svc-card-body">
              <div className="sf-svc-card-num">02</div>
              <h3>All Our Affairs Mastermind</h3>
              <p>For sober entrepreneurs with 2+ full-time employees and over a year of sobriety working the 12 steps. A structured mastermind where business growth and step work go hand in hand&mdash;because scaling a company and maintaining recovery require the same rigorous honesty.</p>
              <span className="sf-tag sf-tag-free">Free &bull; Verified Members</span>
              <a href="/tuesday/" className="sf-svc-card-link">Learn How to Join</a>
            </div>
          </div>

          {/* 03 — Private WhatsApp Community */}
          <div className="sf-svc-card">
            <div className="sf-svc-card-body">
              <div className="sf-svc-card-num">03</div>
              <h3>Private WhatsApp Community</h3>
              <p>Get instant access to our private WhatsApp group&mdash;a 24/7 lifeline of sober entrepreneurs who get it. Share wins, ask for advice, and stay connected between meetings. Real-time support from people who understand both the grind and the recovery.</p>
              <span className="sf-tag sf-tag-free">Free &bull; Open to All</span>
              <a href="https://chat.whatsapp.com/HfxeP3enQtN3oGFnwVOH8D" className="sf-svc-card-link">Join the Community</a>
            </div>
          </div>

          {/* 04 — Phoenix Forum */}
          <div className="sf-svc-card">
            <div className="sf-svc-card-body">
              <div className="sf-svc-card-num">04</div>
              <h3>Phoenix Forum</h3>
              <p>An exclusive peer advisory board for sober entrepreneurs generating $1M+ in revenue with multiple years of sobriety. Intimate groups of up to 10 members meet weekly for curated, high-trust discussions around growth, sobriety, and life&mdash;because at this level, the stakes are higher and the isolation is real.</p>
              <span className="sf-tag sf-tag-paid">Curated &bull; Application Only</span>
              <a href="/phoenix-forum-registration/" className="sf-svc-card-link">Apply to Join</a>
            </div>
          </div>
        </div>
      </div>

      {/* ─── TESTIMONIALS ─── */}
      <div className="sf-section">
        <div className="sf-testimonials-bg">
          <div className="sf-testimonials-heading">
            <h2>What Our Members Say</h2>
            <p>Real words from real founders in recovery.</p>
          </div>
          <div className="sf-testimonials-grid">
            <div className="sf-testimonial-card">
              <blockquote>&ldquo;Sober Founders helped me 6x my business in just a year and helped me get 1 year sober for the first time in my life!&rdquo;</blockquote>
              <cite>Adam C.<span>Sober Founders Member</span></cite>
            </div>
            <div className="sf-testimonial-card">
              <blockquote>&ldquo;This group has been one of the most impactful things I&apos;ve ever been part of.&rdquo;</blockquote>
              <cite>Josh C.<span>Sober Founders Member</span></cite>
            </div>
            <div className="sf-testimonial-card">
              <blockquote>&ldquo;I love that it combines two of my biggest passions, business and recovery.&rdquo;</blockquote>
              <cite>Matt S.<span>Sober Founders Member</span></cite>
            </div>
          </div>
        </div>
      </div>

      {/* ─── BENEFITS ─── */}
      <div className="sf-section">
        <div className="sf-services-heading">
          <h2>Why Founders Choose Us</h2>
          <p>Every program is built around what sober entrepreneurs actually need.</p>
        </div>
        <div className="sf-benefits-grid">
          <div className="sf-benefit-card">
            <div className="sf-benefit-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M144 0a80 80 0 1 1 0 160A80 80 0 1 1 144 0zM512 0a80 80 0 1 1 0 160A80 80 0 1 1 512 0zM0 298.7C0 239.8 47.8 192 106.7 192h42.7c15.9 0 31 3.5 44.6 9.7c-1.3 7.2-1.9 14.7-1.9 22.3c0 38.2 16.8 72.5 43.3 96H21.3C9.6 320 0 310.4 0 298.7zM405.3 320H235.4c26.5-23.5 43.3-57.8 43.3-96c0-7.6-.7-15-1.9-22.3c13.6-6.3 28.7-9.7 44.6-9.7h42.7C423.2 192 471 239.8 471 298.7c0 11.8-9.6 21.3-21.3 21.3h-44.3zM320 256a96 96 0 1 0 0-192 96 96 0 1 0 0 192zm-94.8 32c-47 0-87.9 26.2-108.8 64.8C100.2 378.7 92.9 400.8 86.5 432H553.5c-6.4-31.2-13.7-53.3-29.9-79.2C502.7 314.2 461.8 288 414.8 288H225.2z"/></svg>
            </div>
            <h3>Peer Support</h3>
            <p>Connect with others who truly understand how recovery shapes your business decisions. Real talk, real support.</p>
          </div>
          <div className="sf-benefit-card">
            <div className="sf-benefit-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z"/></svg>
            </div>
            <h3>Accountability</h3>
            <p>Stay on track with sobriety and business goals through a community built on follow-through, not lip service.</p>
          </div>
          <div className="sf-benefit-card">
            <div className="sf-benefit-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm320 96c0-26.9-16.5-49.9-40-59.3V88c0-13.3-10.7-24-24-24s-24 10.7-24 24V292.7c-23.5 9.5-40 32.5-40 59.3c0 35.3 28.7 64 64 64s64-28.7 64-64z"/></svg>
            </div>
            <h3>Professional Growth</h3>
            <p>Access peer insights, workshops, and resources designed to sharpen your skills and scale your business.</p>
          </div>
        </div>
      </div>

      {/* ─── TRUST ─── */}
      <div className="sf-section-sm sf-pad-wrap">
        <div className="sf-trust">
          <img src="https://soberfounders.org/wp-content/uploads/2025/09/candid-seal-silver-2025.png" alt="Candid Silver Transparency Seal 2025" />
          <p><strong>Transparency</strong> - Candid (formerly GuideStar) awarded Sober Founders Inc their Silver Transparency Seal - the highest level a nonprofit can earn in its first year. Every dollar is accounted for and goes directly toward the mission! EIN: 33-4098435</p>
        </div>
      </div>

      {/* ─── FINAL CTA ─── */}
      <div className="sf-section sf-pad-wrap">
        <div className="sf-cta-section">
          <h2>Your Next Chapter Starts Here</h2>
          <p>You don&apos;t have to build alone. Attend a free meeting and see what this community is all about.</p>
          <div className="sf-cta-actions">
            <a href="/events/" className="sf-btn sf-btn-primary">Attend a Free Meeting</a>
            <a href="/phoenix-forum-registration/" className="sf-btn sf-btn-outline">Apply to Phoenix Forum</a>
          </div>
        </div>
      </div>

      {/* ─── CLOSING TAGLINE ─── */}
      <div className="sf-section" style={{ paddingBottom: 120 }}>
        <div className="text-center">
          <h2
            className="text-[clamp(1.4rem,3.5vw,2.2rem)] font-normal text-white/90 italic tracking-wide drop-shadow-[0_2px_20px_rgba(0,0,0,0.8)]"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            &ldquo;It&apos;s not the stopping of using, it&apos;s the <span className="text-[#5eecc0] drop-shadow-[0_0_24px_rgba(94,236,192,0.35)]">starting of living.</span>&rdquo;
          </h2>
        </div>
      </div>
    </div>
  );
}
