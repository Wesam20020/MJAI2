import { useLocation, Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Navbar from './Navbar';
import AppDock from '../reactbits/AppDock';
import ParticleBackground from '../ui/ParticleBackground';
// import PremiumCursor from '../ui/PremiumCursor';
import './AppLayout.css';

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
};

const pageTransition = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1],
};

function AppLayout() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <div className="app-shell">

      {/* Cinematic particle background */}
      <ParticleBackground />

      {/* Navbar — hidden on admin routes */}
      {!isAdminRoute && <Navbar />}

      {/* Page content — animated route transitions */}
      <main className={isAdminRoute ? 'app-main app-main--admin' : 'app-main'}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransition}
            style={{ width: '100%' }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom navigation dock */}
      <AppDock />

    </div>
  );
}

export default AppLayout;
