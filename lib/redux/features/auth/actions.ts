import {
  AuthActionType,
  LoginAction,
  LogoutAction,
  SetUserAction,
  User,
} from './types';

// Action Creators
export const login = (user: User | null): LoginAction => ({
  type: AuthActionType.LOGIN,
  payload: user,
});

export const logout = (): LogoutAction => ({
  type: AuthActionType.LOGOUT,
});

export const setUser = (user: User | null): SetUserAction => ({
  type: AuthActionType.SET_USER,
  payload: user,
});
