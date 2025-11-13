import {
  CounterActionType,
  IncrementAction,
  DecrementAction,
  ResetAction,
} from './types';

// Action Creators
export const increment = (payload?: number): IncrementAction => ({
  type: CounterActionType.INCREMENT,
  payload,
});

export const decrement = (payload?: number): DecrementAction => ({
  type: CounterActionType.DECREMENT,
  payload,
});

export const reset = (): ResetAction => ({
  type: CounterActionType.RESET,
});
