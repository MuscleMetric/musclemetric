import React from 'react';
import { render } from '@testing-library/react-native';
import { CardioAnalyticsView } from '@/app/features/progress/deep-analytics/components/CardioAnalyticsView';
import { cardioDistance, cardioTime, cardioPace } from '@/app/features/progress/deep-analytics/utils/cardioFormat';
import type { CardioAnalytics } from '@/app/features/progress/deep-analytics/types';

jest.mock('@/lib/useAppTheme', () => ({
  useAppTheme: () => ({
    colors: {text:'#111',textMuted:'#666',surface:'#fff',border:'#ddd',primary:'#2563eb'},
    typography: {fontFamily:{regular:'System',semibold:'System',bold:'System'}},
    layout: {space:{lg:16},radius:{xl:16}},
  }),
}));

const session = {session_id:'run-1',completed_at:'2026-10-16T12:00:00Z',distance_km:5,duration_seconds:1500,pace_seconds_per_km:300};
const data: CardioAnalytics = {
  session_count:1,total_distance_km:5,total_duration_seconds:1500,longest_distance_km:5,
  average_pace_seconds_per_km:300,latest:session,sessions:[session],
};

test('formats logged distance, long durations, rounded pace and missing values', () => {
  expect(cardioDistance('5.25')).toBe('5.25 km');
  expect(cardioTime(3661)).toBe('1:01:01');
  expect(cardioPace(299.8)).toBe('5:00 /km');
  for (const value of [null,0,-1,'invalid',Infinity]) {
    expect(cardioDistance(value)).toBe('—');
    expect(cardioTime(value)).toBe('—');
    expect(cardioPace(value)).toBe('—');
  }
});

test('shows cardio metrics and all three trends without strength metrics', () => {
  const screen = render(<CardioAnalyticsView name="Outdoor Run" data={data} timezone="Europe/London" />);
  expect(screen.getByText('Outdoor Run')).toBeTruthy();
  expect(screen.getByText('Average pace')).toBeTruthy();
  expect(screen.getByText('Distance per session')).toBeTruthy();
  expect(screen.getByText('Time per session')).toBeTruthy();
  expect(screen.getByText('Pace per session')).toBeTruthy();
  expect(screen.getByText('Recent sessions')).toBeTruthy();
  expect(screen.queryByText('Estimated 1RM')).toBeNull();
  expect(screen.queryByText('Volume trend')).toBeNull();
});

test('explains empty cardio history without showing fabricated zero strength data', () => {
  const screen = render(<CardioAnalyticsView name="Outdoor Run" data={{...data,session_count:0,latest:null,sessions:[]}} />);
  expect(screen.getByText('No cardio sessions to show yet')).toBeTruthy();
  expect(screen.queryByText('Average pace')).toBeNull();
});

test('retains time-only sessions but omits unavailable pace from charts', () => {
  const timeOnly = {...session,distance_km:null,pace_seconds_per_km:null};
  const screen = render(<CardioAnalyticsView name="Bike" data={{...data,total_distance_km:0,average_pace_seconds_per_km:null,latest:timeOnly,sessions:[timeOnly]}} />);
  expect(screen.getAllByText('No valid entries for this metric yet.')).toHaveLength(2);
  expect(screen.getByText('Recent sessions')).toBeTruthy();
});
