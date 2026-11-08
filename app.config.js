const base = require('./app.json').expo;
module.exports = () => {
  if (process.env.EXPO_PUBLIC_NATIVE_E2E !== 'true') return base;
  const target = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://invalid');
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(target.hostname)) {
    throw new Error('Native test builds require local Supabase');
  }
  return { ...base, name: 'MuscleMetric E2E',
    ios: { ...base.ios, bundleIdentifier: 'com.musclemetric.app.e2e' },
    extra: { ...base.extra, supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY },
  };
};
