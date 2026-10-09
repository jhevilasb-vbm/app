let pending: any = null;
export const setPendingItem = (i: any) => (pending = i);
export const takePendingItem = () => {
  const p = pending;
  pending = null;
  return p;
};
