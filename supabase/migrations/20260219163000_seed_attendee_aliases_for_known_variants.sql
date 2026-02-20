-- Seed canonical attendee aliases for known Zoom display-name variants.
-- This keeps historical data consistent while runtime canonicalization handles future variants.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'attendee_aliases'
  ) THEN
    -- Retarget prior Jessica mappings to stable canonical display name.
    UPDATE public.attendee_aliases
    SET target_name = 'Jessica Dehn'
    WHERE lower(target_name) IN (
      'jessica dehn: abcdino academy, dino drop-in,  explore academy',
      'jessica dehn - dino drop-in, explore academy,  abc'
    );

    INSERT INTO public.attendee_aliases (original_name, target_name)
    VALUES
      -- Chris Lipper variants
      ('Chris Lipper: Functional Business Coach', 'Chris Lipper'),
      ('Chris Lipper: Small Business Owner Coach, Inventor, Speaker, Author, Creator, Connector...', 'Chris Lipper'),

      -- Allen Goddard variants
      ('Allen G. - Mechanical Engineer - Red Summit Machineworks', 'Allen Goddard'),
      ('Allen G. - Mechanical Engineer - Full Curl Manufacturing', 'Allen Goddard'),
      ('Allen G. - Area 40, Victor 164 GSR, District 93', 'Allen Goddard'),
      ('Allen Godard', 'Allen Goddard'),
      ('Allen G', 'Allen Goddard'),
      ('Allen G.', 'Allen Goddard'),

      -- Josh Cougler variants
      ('Josh Cougler On the wall', 'Josh Cougler'),
      ('Josh Cougler On the wall home entertainment', 'Josh Cougler'),

      -- Matt Shiebler variants / shorthand
      ('Matt s', 'Matt Shiebler'),
      ('Matt S', 'Matt Shiebler'),
      ('Matt Shiebler Interactive Accountants', 'Matt Shiebler'),
      ('Matt Shiebler example name', 'Matt Shiebler'),

      -- Jessica Dehn variants
      ('Jessica', 'Jessica Dehn'),
      ('Jessica Dehn: ABCDino Academy, Dino Drop-In,  Explore Academy', 'Jessica Dehn'),
      ('Jessica Dehn - Dino Drop-In, Explore Academy,  ABC', 'Jessica Dehn')
    ON CONFLICT (original_name) DO UPDATE
    SET target_name = EXCLUDED.target_name;
  END IF;
END $$;
