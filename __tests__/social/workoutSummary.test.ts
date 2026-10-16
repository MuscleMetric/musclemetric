import { workoutSummary } from '@/app/features/social/feed/utils/workoutSummary';
import type { WorkoutSnapshot } from '@/app/features/social/feed/types';

const base: WorkoutSnapshot = {
  workout_history_id:'history',workout_id:null,workout_title:'Run',workout_image_key:null,
  completed_at:null,duration_seconds:1800,exercises_count:1,sets_count:2,total_volume:0,
};
test('cardio shows distance and logged interval time instead of kilograms', () => {
  expect(workoutSummary({...base,workout_kind:'cardio',total_distance_km:'5.25',cardio_duration_seconds:'1500'})).toEqual([
    {label:'DISTANCE',value:'5.25',unit:'km'}, {label:'TIME',value:'25:00'}, {label:'EXERCISES',value:'1'},
  ]);
});
test('time-only cardio has no invented distance and falls back to elapsed duration', () => {
  expect(workoutSummary({...base,workout_kind:'cardio',total_distance_km:null,cardio_duration_seconds:null}).slice(0,2)).toEqual([
    {label:'DISTANCE',value:'—',unit:'km'}, {label:'TIME',value:'30:00'},
  ]);
});
test('formats long workouts and missing time', () => {
  expect(workoutSummary({...base,workout_kind:'cardio',cardio_duration_seconds:3661})[1].value).toBe('1:01:01');
  expect(workoutSummary({...base,workout_kind:'cardio',duration_seconds:null})[1].value).toBe('—');
});
test('strength and older backend snapshots retain volume, sets and exercise count', () => {
  expect(workoutSummary({...base,total_volume:8500}).map(x=>x.label)).toEqual(['VOLUME','SETS','EXERCISES']);
  expect(workoutSummary({...base,total_volume:8500})[0].value).toBe('8,500');
  expect(workoutSummary(base)[0].label).toBe('VOLUME');
});
test('mixed sessions retain lifting volume and add cardio distance and time', () => {
  expect(workoutSummary({...base,workout_kind:'mixed',total_volume:1000,total_distance_km:2}).map(x=>x.label)).toEqual(['VOLUME','DISTANCE','TIME']);
});
test('malformed numeric values never render NaN', () => {
  expect(workoutSummary({...base,workout_kind:'cardio',total_distance_km:'invalid',cardio_duration_seconds:'invalid',duration_seconds:null})).toEqual([
    {label:'DISTANCE',value:'—',unit:'km'}, {label:'TIME',value:'—'}, {label:'EXERCISES',value:'1'},
  ]);
});
