// Action Type Enum
export enum AuthActionType {
  LOGIN = 'auth/login',
  LOGOUT = 'auth/logout',
  SET_USER = 'auth/setUser',
}

// State Type
export interface User {
  id: string;
  email: string;
  name?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

// Action Types
export type LoginAction = {
  type: AuthActionType.LOGIN;
  payload: User | null;
};

export type LogoutAction = {
  type: AuthActionType.LOGOUT;
};

export type SetUserAction = {
  type: AuthActionType.SET_USER;
  payload: User | null;
};

// Union of all auth actions
export type AuthAction = LoginAction | LogoutAction | SetUserAction;
