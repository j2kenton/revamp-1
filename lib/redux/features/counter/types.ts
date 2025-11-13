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
export type IncrementAction = {
  type: CounterActionType.INCREMENT;
  payload?: number;
};

export type DecrementAction = {
  type: CounterActionType.DECREMENT;
  payload?: number;
};

export type ResetAction = {
  type: CounterActionType.RESET;
};

// Union of all counter actions
export type CounterAction = IncrementAction | DecrementAction | ResetAction;
