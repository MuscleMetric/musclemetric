export default {
  name: process.env.EXPO_PUBLIC_NATIVE_E2E === 'true' ? 'MuscleMetric — native iOS frontend' : process.env.MM_REPORT_COMBINED === 'true' ? 'MuscleMetric — complete database and production checks' : process.env.MM_REPORT_PREVIEW === 'true'
    ? 'MuscleMetric — SIMULATED report preview (no production calls)'
    : process.env.MM_REPORT_SUITE === 'backend' ? 'MuscleMetric backend privacy, recovery and analytics' : 'MuscleMetric production API checks',
  output: './ci-artifacts/allure-report',
  plugins: { awesome: { options: { singleFile: true, reportLanguage: 'en' } } },
};
