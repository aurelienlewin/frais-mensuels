import { ymFromDate } from './lib/date';
import { StoreProvider } from './state/store';
import { AppView } from './ui/AppView';

export default function App() {
  const initialYm = ymFromDate(new Date());
  return (
    <StoreProvider>
      <AppView initialYm={initialYm} />
    </StoreProvider>
  );
}

