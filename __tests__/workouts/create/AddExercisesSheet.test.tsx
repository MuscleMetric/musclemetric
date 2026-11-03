/* eslint-disable @typescript-eslint/no-require-imports -- Native UI stubs for the picker regression. */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AddExercisesSheet from '@/app/features/workouts/create/modals/AddExercisesSheet';
import { fetchExercises } from '@/app/features/workouts/create/data/exercises.query';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('@/app/features/workouts/create/data/exercises.query', () => ({ fetchExercises: jest.fn() }));
jest.mock('@/lib/useAppTheme', () => ({ useAppTheme: () => ({ colors: {}, typography: { fontFamily: {}, size: {}, lineHeight: {} }, layout: { space: {}, radius: {} } }) }));
jest.mock('@/ui', () => {
  const { Text } = require('react-native');
  return { Pill: ({ label }: { label: string }) => <Text>{label}</Text>, Icon: () => null };
});

const bench = { id: 'bench', name: 'Bench Press' };
const squat = { id: 'squat', name: 'Squat' };
beforeEach(() => {
  jest.clearAllMocks();
  (fetchExercises as jest.Mock).mockResolvedValue([bench, squat]);
  (supabase.rpc as jest.Mock).mockResolvedValue({
    data: 'd853b341-eac2-4397-8494-b2f7d76b9fba',
    error: null,
  });
  (supabase.from as jest.Mock).mockImplementation((table) => {
    if (table !== 'muscles') throw new Error('Unexpected table: ' + table);
    return {
      select: () => ({
        order: async () => ({
          data: [{ id: 1, name: 'Chest' }, { id: 2, name: 'Back' }],
          error: null,
        }),
      }),
    };
  });
});
it('keeps every selection across searches and submits in tap order', async () => {
  (fetchExercises as jest.Mock).mockImplementation(async ({ filters }) =>
    filters.query === 'squat' ? [squat] : [bench],
  );

  const onDone = jest.fn();
  const screen = render(
    <AddExercisesSheet
      visible
      userId="test"
      selectedIds={[]}
      onClose={jest.fn()}
      onDone={onDone}
    />,
  );

  // First result set contains only Bench Press.
  fireEvent.press(await screen.findByText('Bench Press'));

  // A different search replaces the result set with only Squat.
  fireEvent.changeText(
    screen.getByPlaceholderText('Search exercises...'),
    'squat',
  );
  fireEvent.press(await screen.findByText('Squat'));
  expect(screen.queryByText('Bench Press')).toBeNull();

  // Both selections must survive even though Bench is no longer in the
  // current search results.
  fireEvent.press(screen.getByText('Add (2)'));
  expect(onDone).toHaveBeenCalledWith([
    { exerciseId: 'bench', name: 'Bench Press' },
    { exerciseId: 'squat', name: 'Squat' },
  ]);
});
it('uses selection order rather than catalog order and excludes existing exercises', async () => {
  const onDone = jest.fn();
  const screen = render(<AddExercisesSheet visible userId="test" selectedIds={[]} onClose={jest.fn()} onDone={onDone} />);
  fireEvent.press(await screen.findByText('Squat'));
  fireEvent.press(screen.getByText('Bench Press'));
  fireEvent.press(screen.getByText('Add (2)'));
  expect(onDone).toHaveBeenCalledWith([{ exerciseId: 'squat', name: 'Squat' }, { exerciseId: 'bench', name: 'Bench Press' }]);
  screen.unmount();
  const locked = render(<AddExercisesSheet visible userId="test" selectedIds={['bench']} onClose={jest.fn()} onDone={onDone} />);
  fireEvent.press(await locked.findByText('Bench Press'));
  fireEvent.press(locked.getByText('Squat'));
  fireEvent.press(locked.getByText('Add (1)'));
  expect(onDone).toHaveBeenLastCalledWith([{ exerciseId: 'squat', name: 'Squat' }]);
});

it('creates a private strength exercise, selects it, and excludes already-present exercises', async () => {
  const onDone = jest.fn();
  const screen = render(
    <AddExercisesSheet visible userId="test" selectedIds={['bench']} onClose={jest.fn()} onDone={onDone} />,
  );

  fireEvent.press(screen.getByText('+ Create exercise'));
  fireEvent.changeText(screen.getByPlaceholderText('e.g. Wide-Grip Cable Row'), '  My Cable Row  ');
  fireEvent.changeText(screen.getByPlaceholderText('Setup, cues or notes'), 'Keep elbows tucked');
  fireEvent.press(await screen.findByText('Back'));
  fireEvent.press(screen.getByText('Dumbbells'));
  fireEvent.press(screen.getAllByText('Create exercise')[1]);

  await waitFor(() => {
    expect(supabase.rpc).toHaveBeenCalledWith('create_private_exercise', {
      p_name: 'My Cable Row',
      p_equipment: 'dumbbell',
      p_muscle_ids: [2],
      p_instructions: 'Keep elbows tucked',
    });
    expect(screen.getByText('Add (1)')).toBeTruthy();
  });
  // No refresh required: selected custom exercise is immediately part of the picker.
  expect(screen.getByText('My Cable Row')).toBeTruthy();
  fireEvent.press(screen.getByText('Add (1)'));
  expect(onDone).toHaveBeenCalledWith([
    { exerciseId: 'd853b341-eac2-4397-8494-b2f7d76b9fba', name: 'My Cable Row' },
  ]);
});

it('does not select a custom exercise when the private-exercise RPC fails', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({
    data: null,
    error: new Error('Could not save'),
  });
  const onDone = jest.fn();
  const screen = render(
    <AddExercisesSheet visible userId="test" selectedIds={[]} onClose={jest.fn()} onDone={onDone} />,
  );
  fireEvent.press(screen.getByText('+ Create exercise'));
  fireEvent.changeText(screen.getByPlaceholderText('e.g. Wide-Grip Cable Row'), 'New Row');
  fireEvent.press(await screen.findByText('Chest'));
  fireEvent.press(screen.getByText('Barbell'));
  fireEvent.press(screen.getAllByText('Create exercise')[1]);

  await waitFor(() => expect(screen.getByText('Could not save')).toBeTruthy());
  expect(screen.queryByText('Add (1)')).toBeNull();
  expect(onDone).not.toHaveBeenCalled();
  expect(screen.getAllByText('Create exercise').length).toBeGreaterThan(0);
});

it('ignores a creation result from a closed and reopened picker session', async () => {
  let finishCreation!: (result: { data: string; error: null }) => void;
  (supabase.rpc as jest.Mock).mockReturnValue(
    new Promise<{ data: string; error: null }>((resolve) => {
      finishCreation = resolve;
    }),
  );
  const onDone = jest.fn();
  const onClose = jest.fn();
  const picker = (visible: boolean) => (
    <AddExercisesSheet visible={visible} userId="test" selectedIds={[]} onClose={onClose} onDone={onDone} />
  );
  const screen = render(picker(true));

  fireEvent.press(screen.getByText('+ Create exercise'));
  fireEvent.changeText(screen.getByPlaceholderText('e.g. Wide-Grip Cable Row'), 'Old Exercise');
  fireEvent.press(await screen.findByText('Chest'));
  fireEvent.press(screen.getByText('Barbell'));
  fireEvent.press(screen.getAllByText('Create exercise')[1]);
  await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1));

  // Leave while saving, close the picker, and start another session.
  fireEvent.press(screen.getByLabelText('Back to exercise selection'));
  fireEvent.press(screen.getByText('Cancel'));
  expect(onClose).toHaveBeenCalledTimes(1);
  screen.rerender(picker(false));
  screen.rerender(picker(true));
  fireEvent.press(screen.getByText('+ Create exercise'));
  fireEvent.changeText(screen.getByPlaceholderText('e.g. Wide-Grip Cable Row'), 'New Exercise');

  await act(async () => {
    finishCreation({ data: 'd853b341-eac2-4397-8494-b2f7d76b9fba', error: null });
  });

  // The old completion cannot close the new create form or select the old exercise.
  expect(screen.getByPlaceholderText('e.g. Wide-Grip Cable Row').props.value).toBe('New Exercise');
  fireEvent.press(screen.getByLabelText('Back to exercise selection'));
  expect(screen.getByText('Add (0)')).toBeTruthy();
  expect(screen.queryByText('Old Exercise')).toBeNull();
  expect(onDone).not.toHaveBeenCalled();
});
