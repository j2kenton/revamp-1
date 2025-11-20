// Action Type Enum
export enum CounterActionType {
  INCREMENT = 'counter/increment',
  DECREMENT = 'counter/decrement',
  RESET = 'counter/reset',
}

// State Type
export interface CounterState {
  count: number;
}

// Action Types
export interface IncrementAction {
  type: CounterActionType.INCREMENT;
  payload?: number;
}

export interface DecrementAction {
  type: CounterActionType.DECREMENT;
  payload?: number;
}

export interface ResetAction {
  type: CounterActionType.RESET;
}

// Union of all counter actions
export type CounterAction = IncrementAction | DecrementAction | ResetAction;
