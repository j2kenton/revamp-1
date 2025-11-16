// 2. Third-party
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';

// 4. ./ relative
import type { RootState, AppDispatch } from './store';

// Pre-typed hooks for better TypeScript support
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
