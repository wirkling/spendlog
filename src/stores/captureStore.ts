import { create } from 'zustand';

interface CaptureState {
  shutterCallback: (() => void) | null;
  setShutterCallback: (cb: (() => void) | null) => void;
}

export const useCaptureStore = create<CaptureState>((set) => ({
  shutterCallback: null,
  setShutterCallback: (cb) => set({ shutterCallback: cb }),
}));
