import { AuthState, AuthAction, AuthActionType } from './types';

// Initial State
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
};

// Reducer
export const authReducer = (
  state = initialState,
  action: AuthAction,
): AuthState => {
  switch (action.type) {
    case AuthActionType.LOGIN:
      if (action.payload === null) {
        return initialState;
      }
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
      };
    case AuthActionType.LOGOUT:
      return initialState;
    case AuthActionType.SET_USER:
      if (action.payload === null) {
        return initialState;
      }
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
      };
    default:
      return state;
  }
};
