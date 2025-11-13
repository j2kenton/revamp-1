import { CounterState, CounterAction, CounterActionType } from './types';

// Initial State
const initialState: CounterState = {
  count: 0,
};

// Reducer
export const counterReducer = (
  state = initialState,
  action: CounterAction,
): CounterState => {
  switch (action.type) {
    case CounterActionType.INCREMENT:
      return {
        ...state,
        count: state.count + (action.payload ?? 1),
      };
    case CounterActionType.DECREMENT:
      return {
        ...state,
        count: state.count - (action.payload ?? 1),
      };
    case CounterActionType.RESET:
      return initialState;
    default:
      return state;
  }
};
