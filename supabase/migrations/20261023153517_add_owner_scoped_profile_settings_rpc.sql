-- Fix the missing RPC used by Settings -> Experience and Primary Goal.
-- Owner scoped, no SECURITY DEFINER and no arbitrary JSON/settings mutations.
create or replace function public.set_profile_settings_v1(p_key text, p_value text)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $function$
declare
  v_settings jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'auth_missing';
  end if;

  if (p_key = 'level' and p_value in ('beginner','intermediate','advanced'))
     or (p_key = 'primaryGoal' and p_value in
         ('get_stronger','build_muscle','lose_fat','improve_endurance','general_fitness')) then
    update public.profiles
    set settings = jsonb_set(
      coalesce(settings, '{}'::jsonb), array[p_key], to_jsonb(p_value), true
    ), updated_at = now()
    where id = auth.uid()
    returning settings into v_settings;
    if not found then
      raise exception using errcode = '42501', message = 'profile_not_owned_or_missing';
    end if;
    return v_settings;
  end if;

  raise exception using errcode = '22023', message = 'invalid_profile_setting';
end;
$function$;

revoke execute on function public.set_profile_settings_v1(text,text) from public, anon;
grant execute on function public.set_profile_settings_v1(text,text) to authenticated;
