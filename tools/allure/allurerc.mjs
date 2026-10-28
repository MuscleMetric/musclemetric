export default {
  name: process.env.MM_REPORT_PREVIEW === 'true'
    ? 'MuscleMetric — SIMULATED report preview (no production calls)'
    : 'MuscleMetric production API checks',
  output: './ci-artifacts/allure-report',
  plugins: { awesome: { options: { singleFile: true, reportLanguage: 'en' } } },
};
