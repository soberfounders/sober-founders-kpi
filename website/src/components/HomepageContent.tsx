import Link from "next/link";
import "../app/test/homepage.css";

/* eslint-disable @next/next/no-img-element */

export default function HomepageContent() {
  return (
    <div className="sf-page">
      {/* --- WHAT IS SOBER FOUNDERS? --- */}
      <div className="sf-section">
        <div className="sf-definition">
          <h2>What is Sober Founders?</h2>
          <p>
            Sober Founders is a 501(c)(3) nonprofit community for
            entrepreneurs in recovery from addiction. Founded in 2024 after a
            successful exit, our creator knew there had to be a way to bridge
            the gap between sobriety and business -and set out to dedicate
            his next chapter to bringing together like-minded, successful sober
            entrepreneurs.
          </p>
          <p>
            Our members represent over $500 million in combined revenue across
            all industries. We provide free weekly mastermind sessions, peer
            support, and the Phoenix Forum -an exclusive peer advisory
            board for founders with $1M+ in annual revenue and 1+ year of
            sobriety.
          </p>
        </div>
      </div>

      {/* --- STATS --- */}
      <div className="sf-section-sm sf-pad-wrap">
        <div className="sf-stats-section">
          <div className="sf-stats-grid">
            <div className="sf-stat">
              <div className="sf-stat-icon">
                <span className="sf-icon-glyph sf-icon-glyph--people" aria-hidden="true" />
              </div>
              <div className="sf-stat-num">500+</div>
              <div className="sf-stat-label">Entrepreneurs Helped</div>
            </div>
            <div className="sf-stat">
              <div className="sf-stat-icon">
                <span className="sf-icon-glyph sf-icon-glyph--money" aria-hidden="true" />
              </div>
              <div className="sf-stat-num">$500M+</div>
              <div className="sf-stat-label">Combined Member Revenue</div>
            </div>
            <div className="sf-stat">
              <div className="sf-stat-icon">
                <span className="sf-icon-glyph sf-icon-glyph--growth" aria-hidden="true" />
              </div>
              <div className="sf-stat-num">$1M+</div>
              <div className="sf-stat-label">
                Additional Revenue Generated for Members
              </div>
            </div>
            <div className="sf-stat">
              <div className="sf-stat-icon">
                <span className="sf-icon-glyph sf-icon-glyph--heart" aria-hidden="true" />
              </div>
              <div className="sf-stat-num">98%</div>
              <div className="sf-stat-label">
                Say We Helped Them Stay Sober Longer
              </div>
            </div>
            <div className="sf-stat">
              <a
                href="/events/"
                className="block"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="sf-stat-icon">
                  <span className="sf-icon-glyph sf-icon-glyph--calendar" aria-hidden="true" />
                </div>
                <div className="sf-stat-num">2x Weekly</div>
                <div className="sf-stat-label">Tuesday &amp; Thursday Sessions</div>
              </a>
            </div>
            <div className="sf-stat">
              <a
                href="/donate/"
                className="block"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="sf-stat-icon">
                  <span className="sf-icon-glyph sf-icon-glyph--check" aria-hidden="true" />
                </div>
                <div className="sf-stat-num">501(c)(3)</div>
                <div className="sf-stat-label">EIN: 33-4098435</div>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* --- DIVIDER --- */}
      <div style={{ padding: "40px 0" }}>
        <div className="sf-divider">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
            <path d="M208 32a48 48 0 0 0-96 0v16H64C28.7 48 0 76.7 0 112v48H512V112c0-35.3-28.7-64-64-64H400V32a48 48 0 0 0-96 0v16H208V32zM0 192V464c0 26.5 21.5 48 48 48H464c26.5 0 48-21.5 48-48V192H0z" />
          </svg>
        </div>
      </div>

      {/* --- HOW WE SUPPORT FOUNDERS --- */}
      <div className="sf-section">
        <div className="sf-services-heading">
          <h2>How We Support Founders</h2>
          <p>
            Four tiers of community -from open masterminds to an exclusive
            peer advisory board -so you can find your fit.
          </p>
        </div>

        <div className="sf-svc-grid">
          <div className="sf-svc-card">
            <div className="sf-svc-card-body">
              <div className="sf-svc-card-num">01</div>
              <h3>Thursday Open Mastermind</h3>
              <p>
                Open to any sober entrepreneur. Show up, share what&apos;s real,
                and get honest feedback from peers who understand the
                intersection of business pressure and recovery. No application
                required -just be sober and own a business.
              </p>
              <span className="sf-tag sf-tag-free">Free &bull; Open to All</span>
              <a href="/events/" className="sf-svc-card-link">
                View Upcoming Events
              </a>
            </div>
          </div>

          <div className="sf-svc-card">
            <div className="sf-svc-card-body">
              <div className="sf-svc-card-num">02</div>
              <h3>All Our Affairs Mastermind</h3>
              <p>
                For sober entrepreneurs with 2+ full-time employees and over a
                year of sobriety working the 12 steps. A structured mastermind
                where business growth and step work go hand in hand -because
                scaling a company and maintaining recovery require the same
                rigorous honesty.
              </p>
              <span className="sf-tag sf-tag-free">
                Free &bull; Verified Members
              </span>
              <a href="/tuesday/" className="sf-svc-card-link">
                Learn How to Join
              </a>
            </div>
          </div>

          <div className="sf-svc-card">
            <div className="sf-svc-card-body">
              <div className="sf-svc-card-num">03</div>
              <h3>Private WhatsApp Community</h3>
              <p>
                Get instant access to our private WhatsApp group -a 24/7
                lifeline of sober entrepreneurs who get it. Share wins, ask for
                advice, and stay connected between meetings. Real-time support
                from people who understand both the grind and the recovery.
              </p>
              <span className="sf-tag sf-tag-free">Free &bull; Open to All</span>
              <a
                href="https://chat.whatsapp.com/HfxeP3enQtN3oGFnwVOH8D"
                className="sf-svc-card-link"
              >
                Join the Community
              </a>
            </div>
          </div>

          <div className="sf-svc-card">
            <div className="sf-svc-card-body">
              <div className="sf-svc-card-num">04</div>
              <h3>Phoenix Forum</h3>
              <p>
                An exclusive peer advisory board for sober entrepreneurs
                generating $1M+ in revenue with multiple years of sobriety.
                Intimate groups of up to 10 members meet weekly for curated,
                high-trust discussions around growth, sobriety, and life -because
                at this level, the stakes are higher and the isolation is real.
              </p>
              <span className="sf-tag sf-tag-paid">
                Curated &bull; Application Only
              </span>
              <a href="/phoenix-forum-registration/" className="sf-svc-card-link">
                Apply to Join
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* --- TESTIMONIALS --- */}
      <div className="sf-section">
        <div className="sf-testimonials-bg">
          <div className="sf-testimonials-heading">
            <h2>What Our Members Say</h2>
            <p>Real words from real founders in recovery.</p>
          </div>
          <div className="sf-testimonials-grid">
            <div className="sf-testimonial-card">
              <blockquote>
                &ldquo;Sober Founders helped me grow from $36k MRR to $120k MRR
                and helped me get 1 year sober for the first time in my
                life.&rdquo;
              </blockquote>
              <cite>
                Adam C.<span>Sober Founders Member</span>
              </cite>
              <Link
                href="/case-studies/adam-c"
                className="mt-4 inline-block text-sm font-semibold uppercase tracking-[0.08em] text-[#5eecc0] transition hover:text-white"
              >
                Read case study
              </Link>
            </div>
            <div className="sf-testimonial-card">
              <blockquote>
                &ldquo;Every morning I wake up energized and ready to take on the
                world, substance free. My business is growing, my relationships
                are better, and Sober Founders played a big role in shifting how
                I viewed things.&rdquo;
              </blockquote>
              <cite>
                Josh C.<span>Sober Founders Member</span>
              </cite>
              <Link
                href="/case-studies/josh-c"
                className="mt-4 inline-block text-sm font-semibold uppercase tracking-[0.08em] text-[#5eecc0] transition hover:text-white"
              >
                Read case study
              </Link>
            </div>
            <div className="sf-testimonial-card">
              <blockquote>
                &ldquo;I love that it combines two of my biggest passions,
                business and recovery.&rdquo;
              </blockquote>
              <cite>
                Matt S.<span>Sober Founders Member</span>
              </cite>
            </div>
            <div className="sf-testimonial-card">
              <blockquote>
                &ldquo;I cannot recommend Sober Founders enough. I want to shout
                from the rooftops about how much this group has impacted my
                life. One profound enlightenment after another. It&apos;s totally
                divinely inspired. I have truly found a home.&rdquo;
              </blockquote>
              <cite>
                Joe G.<span>Sober Founders Member</span>
              </cite>
            </div>
          </div>
        </div>
      </div>

      {/* --- BENEFITS --- */}
      <div className="sf-section">
        <div className="sf-services-heading">
          <h2>Why Founders Choose Us</h2>
          <p>Every program is built around what sober entrepreneurs actually need.</p>
        </div>
        <div className="sf-benefits-grid">
          <div className="sf-benefit-card">
            <div className="sf-benefit-icon">
              <span className="sf-icon-glyph sf-icon-glyph--people" aria-hidden="true" />
            </div>
            <h3>Peer Support</h3>
            <p>
              Connect with others who truly understand how recovery shapes your
              business decisions. Real talk, real support.
            </p>
          </div>
          <div className="sf-benefit-card">
            <div className="sf-benefit-icon">
              <span className="sf-icon-glyph sf-icon-glyph--check" aria-hidden="true" />
            </div>
            <h3>Accountability</h3>
            <p>
              Stay on track with sobriety and business goals through a community
              built on follow-through, not lip service.
            </p>
          </div>
          <div className="sf-benefit-card">
            <div className="sf-benefit-icon">
              <span className="sf-icon-glyph sf-icon-glyph--growth" aria-hidden="true" />
            </div>
            <h3>Professional Growth</h3>
            <p>
              Access peer insights, workshops, and resources designed to
              sharpen your skills and scale your business.
            </p>
          </div>
        </div>
      </div>

      {/* --- TRUST --- */}
      <div className="sf-section-sm sf-pad-wrap">
        <div className="sf-trust">
          <img
            src="https://soberfounders.org/wp-content/uploads/2025/09/candid-seal-silver-2025.png"
            alt="Candid Silver Transparency Seal 2025"
          />
          <p>
            <strong>Transparency</strong> - Candid (formerly GuideStar) awarded
            Sober Founders Inc their Silver Transparency Seal - the highest
            level a nonprofit can earn in its first year. Every dollar is
            accounted for and goes directly toward the mission! EIN:
            33-4098435
          </p>
        </div>
      </div>

      {/* --- FINAL CTA --- */}
      <div className="sf-section sf-pad-wrap">
        <div className="sf-cta-section">
          <h2>Your Next Chapter Starts Here</h2>
          <p>
            You don&apos;t have to build alone. Attend a free meeting and see
            what this community is all about.
          </p>
          <div className="sf-cta-actions">
            <a href="/events/" className="sf-btn sf-btn-primary">
              Attend a Free Meeting
            </a>
            <a href="/phoenix-forum-registration/" className="sf-btn sf-btn-outline">
              Apply to Phoenix Forum
            </a>
          </div>
        </div>
      </div>

      {/* --- CLOSING TAGLINE --- */}
      <div className="sf-section" style={{ paddingBottom: 120 }}>
        <div className="text-center">
          <h2
            className="text-[clamp(1.4rem,3.5vw,2.2rem)] font-normal text-white/90 italic tracking-wide drop-shadow-[0_2px_20px_rgba(0,0,0,0.8)]"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            &ldquo;It&apos;s not the stopping of using, it&apos;s the{" "}
            <span className="text-[#5eecc0] drop-shadow-[0_0_24px_rgba(94,236,192,0.35)]">
              starting of living.
            </span>
            &rdquo;
          </h2>
        </div>
      </div>
    </div>
  );
}
