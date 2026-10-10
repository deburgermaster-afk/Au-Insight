-- PR pathway engine: everything the official data says about getting permanent residence through one
-- occupation, in one call, for the chat and the occupation page. It combines the skilled occupation list (which
-- visas the occupation opens), the SkillSelect rounds (minimum points, how often it is invited, the next round),
-- Jobs and Skills Australia's shortage ratings and jobs data, the assessing authority and Home Affairs'
-- processing times, and lays them out as routes and a dated timeline. Nothing here is a forecast: where the
-- data can't support an estimate, the step says so.

-- One visa's processing times as published (50% and 90% of applications decided), or null.
create or replace function private.processing_for(p_subclass text, p_stream text default null)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('subclass', t.subclass, 'stream', nullif(t.stream, ''), 'p50', t.p50, 'p90', t.p90,
           'p50_days', t.p50_days, 'p90_days', t.p90_days, 'updated', t.updated, 'source_url', t.source_url)
  from public.visa_processing_times t
  where t.subclass = p_subclass and t.listed and t.p50_days is not null
    and (p_stream is null or t.stream ilike p_stream)
  order by t.in_guide desc, t.p50_days
  limit 1
$$;

create or replace function public.pr_pathway(p_anzsco text, p_points int default null, p_state text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  o public.occupations;
  v_since date := private.rounds_since();
  v_last record;
  v_invited_12m int;
  v_rounds_12m int;
  v_gap int;
  v_next date;
  v_days_to_next int;
  v_state text := upper(nullif(btrim(p_state), ''));
  v_auth jsonb;
  v_assess_min int;
  v_assess_max int;
  v_assess_text text;
  v_p189 jsonb := private.processing_for('189', 'Points-Tested');
  v_p190 jsonb := private.processing_for('190');
  v_p491 jsonb := private.processing_for('491', 'State/Territory%');
  v_p491f jsonb := private.processing_for('491', 'Family%');
  v_p482 jsonb := private.processing_for('482', 'Core Skills');
  v_p186 jsonb := private.processing_for('186', 'Direct Entry%');
  v_p494 jsonb := private.processing_for('494', 'Employer Sponsored');
  v_eoi_min int;
  v_eoi_max int;
  v_eoi_text text;
  v_points_text text;
  v_steps jsonb;
  v_total jsonb;
begin
  select * into o from public.occupations x
  where x.anzsco = btrim(p_anzsco) or x.code = left(btrim(p_anzsco), 6) or x.code_2022 = left(btrim(p_anzsco), 6)
  order by (x.anzsco = btrim(p_anzsco)) desc, x.listed desc, length(x.anzsco)
  limit 1;
  if not found then
    return null;
  end if;

  -- Invitations (subclass 189).
  select r.min_points, r.round_date into v_last
  from public.skillselect_round_occupations r
  where r.anzsco = o.anzsco and r.subclass = '189' and r.listed
  order by r.round_date desc limit 1;
  select count(distinct r.round_date) into v_invited_12m
  from public.skillselect_round_occupations r
  where r.anzsco = o.anzsco and r.subclass = '189' and r.listed and r.round_date > v_since;
  select count(*) into v_rounds_12m
  from public.skillselect_rounds where subclass = '189' and invited > 0 and round_date > v_since;
  -- Typical gap between 189 rounds over the last two years of rounds.
  select round(avg(d))::int into v_gap from (
    select round_date - lag(round_date) over (order by round_date) as d
    from public.skillselect_rounds
    where subclass = '189' and invited > 0
      and round_date > (select max(round_date) from public.skillselect_rounds) - 730
  ) g where d is not null;
  select nullif(value, '')::date into v_next from public.skillselect_meta where key = 'next_round_189';
  v_days_to_next := case when v_next >= current_date then v_next - current_date end;

  -- The assessing authority: researched facts when we have them, else the list's name and link.
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'short', a.short, 'name', coalesce(aa.name, a.name), 'url', coalesce(aa.url, a.url),
           'assesses', aa.assesses, 'processing', aa.processing_text, 'processing_min_days', aa.processing_min_days,
           'processing_max_days', aa.processing_max_days, 'priority', aa.priority_text, 'fee', aa.fee_text,
           'validity', aa.validity_text, 'requirements', aa.requirements, 'as_at', aa.as_at))), '[]'),
         min(aa.processing_min_days), max(aa.processing_max_days),
         string_agg(coalesce(aa.short, a.short) || ': ' || aa.processing_text, '; ') filter (where aa.processing_text is not null)
    into v_auth, v_assess_min, v_assess_max, v_assess_text
  from jsonb_to_recordset(o.assessing_authorities) as a(short text, name text, url text)
  left join public.assessing_authorities aa on aa.short = a.short;

  -- Your points against the latest 189 minimum.
  v_points_text := case
    when p_points is null or v_last.min_points is null then null
    when p_points >= v_last.min_points then format('Your %s points meet the latest 189 minimum of %s.', p_points, v_last.min_points)
    else format('You need %s more points to reach the latest 189 minimum of %s.', v_last.min_points - p_points, v_last.min_points)
  end;

  -- Waiting for an invitation: only estimated when the occupation is being invited at your points.
  if v_invited_12m > 0 and (p_points is null or p_points >= v_last.min_points) then
    v_eoi_min := coalesce(v_days_to_next, 0);
    v_eoi_max := coalesce(v_days_to_next, 0) + coalesce(v_gap, 180);
    v_eoi_text := format('Invited in %s of the last %s rounds at %s points or more. Rounds have been about every %s days%s.',
      v_invited_12m, greatest(v_rounds_12m, v_invited_12m), v_last.min_points, coalesce(v_gap::text, '?'),
      case when v_next is not null then '; the next is on ' || to_char(v_next, 'FMDD Mon YYYY') else '' end);
  elsif v_last.round_date is not null then
    v_eoi_text := format('Not invited for 189 in the last 12 months (last on %s at %s points). A 189 invitation can''t be estimated; state nomination (190 or 491) or employer sponsorship is the likelier route.',
      to_char(v_last.round_date, 'FMDD Mon YYYY'), v_last.min_points);
  else
    v_eoi_text := 'Never invited in the published 189 rounds. Look at state nomination (190 or 491) or employer sponsorship.';
  end if;

  v_steps := jsonb_build_array(
    jsonb_strip_nulls(jsonb_build_object('step', 'Skills assessment', 'min_days', v_assess_min, 'max_days', v_assess_max,
      'text', coalesce(v_assess_text, 'Processing time not published in our data; check the assessing authority''s site.'))),
    jsonb_build_object('step', 'English test and points', 'text',
      'Book an English test early: higher scores add points (Proficient +10, Superior +20).'),
    jsonb_strip_nulls(jsonb_build_object('step', 'Expression of Interest and invitation (189)', 'min_days', v_eoi_min,
      'max_days', v_eoi_max, 'text', v_eoi_text)),
    jsonb_strip_nulls(jsonb_build_object('step', 'Visa decision (189)', 'min_days', (v_p189 ->> 'p50_days')::int,
      'max_days', (v_p189 ->> 'p90_days')::int,
      'text', format('Half of applications decided within %s, 90%% within %s (Home Affairs, updated %s).',
        v_p189 ->> 'p50', v_p189 ->> 'p90', v_p189 ->> 'updated'))));

  -- Total, only when every step with a duration is known.
  v_total := case when v_assess_min is not null and v_eoi_min is not null and v_p189 is not null then
    jsonb_build_object('min_days', v_assess_min + v_eoi_min + (v_p189 ->> 'p50_days')::int,
                       'max_days', v_assess_max + v_eoi_max + (v_p189 ->> 'p90_days')::int,
                       'note', 'Skills assessment, waiting for a 189 invitation and the visa decision, if you already have the points and English.')
  end;

  return jsonb_build_object(
    'occupation', jsonb_build_object('anzsco', o.anzsco, 'code', o.code, 'title', o.title, 'lists', o.lists,
      'visa_subclasses', o.visa_subclasses, 'listed', o.listed),
    'assessment', v_auth,
    'invitations', jsonb_strip_nulls(jsonb_build_object(
      'last_min_points_189', v_last.min_points, 'last_invited_189', v_last.round_date,
      'invited_rounds_12m', v_invited_12m, 'rounds_12m', v_rounds_12m, 'typical_gap_days', v_gap, 'next_round_189', v_next,
      'your_points', v_points_text,
      'by_year', (
        select jsonb_agg(y order by y.program_year desc) from (
          select rd.program_year, r.subclass, count(*) as invited_in, min(r.min_points) as lowest,
                 max(r.min_points) as highest,
                 (select count(*) from public.skillselect_rounds x where x.program_year = rd.program_year
                    and x.subclass = r.subclass and x.invited > 0) as rounds_held,
                 (select sum(x.invited) from public.skillselect_rounds x where x.program_year = rd.program_year
                    and x.subclass = r.subclass) as invited_total
          from public.skillselect_round_occupations r
          join public.skillselect_rounds rd on rd.round_date = r.round_date and rd.subclass = r.subclass
          where r.anzsco = o.anzsco and r.listed
          group by rd.program_year, r.subclass
        ) y))),
    'routes', jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object('visa', '189', 'name', 'Skilled Independent (permanent)', 'open', 'MLTSSL' = any(o.lists),
        'how', 'Points-tested; no sponsor. Needs an invitation from a SkillSelect round.',
        'points', v_last.min_points, 'processing', v_p189)),
      jsonb_strip_nulls(jsonb_build_object('visa', '190', 'name', 'Skilled Nominated (permanent)', 'open', o.lists && array['MLTSSL', 'STSOL'],
        'how', 'Points-tested with a state or territory nomination (+5 points). The occupation must be on that state''s own list and you must meet its residence or work rules.',
        'processing', v_p190)),
      jsonb_strip_nulls(jsonb_build_object('visa', '491', 'name', 'Skilled Work Regional (provisional, 5 years; path to permanent 191 after 3 years in a regional area)',
        'open', o.lists && array['MLTSSL', 'STSOL', 'ROL'],
        'how', 'Points-tested with a state nomination or an eligible relative in a designated regional area (+15 points).',
        'processing', v_p491, 'processing_family', v_p491f)),
      jsonb_strip_nulls(jsonb_build_object('visa', '482', 'name', 'Skills in Demand, Core Skills stream (temporary; path to permanent 186)',
        'open', 'CSOL' = any(o.lists), 'how', 'An employer sponsors you; no points test.', 'processing', v_p482)),
      jsonb_strip_nulls(jsonb_build_object('visa', '186', 'name', 'Employer Nomination Scheme (permanent)',
        'open', 'CSOL' = any(o.lists), 'how', 'Direct Entry needs an employer nomination and a skills assessment (usually 3 years'' experience); Transition after 2 years on a 482 with the employer.',
        'processing', v_p186)),
      jsonb_strip_nulls(jsonb_build_object('visa', '494', 'name', 'Skilled Employer Sponsored Regional (provisional; path to permanent 191)',
        'open', o.lists && array['MLTSSL', 'STSOL', 'ROL'], 'how', 'A regional employer sponsors you.', 'processing', v_p494))),
    'states', (
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'state', s.state, 'shortage', s.rating, 'shortage_year', s.year,
               'nominations', (select jsonb_object_agg(n.subclass, n.nominations) from public.state_nominations n
                               where n.state = s.state and n.program_year = (select max(program_year) from public.state_nominations)),
               'nominations_period', (select max(n.program_year) || ' program year, ' || max(n.as_of) from public.state_nominations n
                                      where n.program_year = (select max(program_year) from public.state_nominations)),
               'chosen', s.state = v_state))
             order by (s.state = v_state) desc, (s.rating ilike '%shortage%' and s.rating not ilike 'no %') desc, s.state)
      from (
        select x.year, st.state,
               case st.state when 'NSW' then x.nsw when 'VIC' then x.vic when 'QLD' then x.qld when 'SA' then x.sa
                             when 'WA' then x.wa when 'TAS' then x.tas when 'NT' then x.nt when 'ACT' then x.act end as rating
        from (select * from public.occupation_shortage y where y.anzsco = coalesce(o.code_2022, o.code) and y.listed
              order by y.year desc limit 1) x
        cross join unnest(array['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']) as st(state)
      ) s),
    'outlook', jsonb_strip_nulls(jsonb_build_object(
      'shortage_by_year', (select jsonb_agg(jsonb_build_object('year', y.year, 'national', y.national) order by y.year desc)
                           from public.occupation_shortage y where y.anzsco in (coalesce(o.code_2022, o.code), o.code) and y.listed),
      'jobs', (select jsonb_strip_nulls(jsonb_build_object('employed', p.employed, 'median_weekly_earnings', p.median_weekly_earnings,
                        'annual_growth_pct', p.annual_growth, 'projected_growth_pct', p.projected_growth, 'level', p.data ->> 'level',
                        'as_at', p.as_at))
               from public.occupation_profiles p where p.anzsco in (o.code, left(o.code, 4)) order by length(p.anzsco) desc limit 1),
      'note', 'Shortage ratings and jobs data from Jobs and Skills Australia. Past invitation rounds don''t guarantee future ones.')),
    'timeline', jsonb_strip_nulls(jsonb_build_object('steps', v_steps, 'total', v_total)),
    'sources', jsonb_build_array(
      jsonb_build_object('title', 'Skilled occupation list (Home Affairs)', 'url', coalesce(o.source_url, 'https://immi.homeaffairs.gov.au/visas/working-in-australia/skill-occupation-list')),
      jsonb_build_object('title', 'SkillSelect invitation rounds (Home Affairs)', 'url', 'https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/invitation-rounds'),
      jsonb_build_object('title', 'Global visa processing times (Home Affairs)', 'url', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-processing-times/global-visa-processing-times'),
      jsonb_build_object('title', 'Occupation Shortage List (Jobs and Skills Australia)', 'url', 'https://www.jobsandskills.gov.au/data/occupation-shortage/occupation-shortage-list'))
  );
end
$$;

revoke execute on function private.processing_for(text, text) from public;
revoke execute on function public.pr_pathway(text, int, text) from public;
grant execute on function public.pr_pathway(text, int, text) to anon, authenticated;
