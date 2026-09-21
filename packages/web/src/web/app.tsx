import { AnimatePresence, motion } from "motion/react";
import { Link, Route, Switch, useLocation } from "wouter";
import { Layout } from "./components/layout";
import { Provider } from "./components/provider";
import { Button } from "./components/ui";
import ApiPage from "./pages/api";
import HomePage from "./pages/home";
import HowItWorksPage from "./pages/how-it-works";
import IntentPage from "./pages/intent";
import IntentsPage from "./pages/intents";
import MarketsPage from "./pages/markets";
import PortfolioPage from "./pages/portfolio";
import ReceiptPage from "./pages/receipt";
import RecordBookPage from "./pages/record";
import RecordDetailPage from "./pages/record-detail";
import RedeemPage from "./pages/redeem";
import StatementPage from "./pages/statement";
import StatusPage from "./pages/status";
import LeaderboardPage from "./pages/leaderboard";
import DeskPage from "./pages/desk";
import TokenPage from "./pages/token";
import ReportsPage from "./pages/reports";
import ReportPage from "./pages/report";
import GenesisPage from "./pages/genesis";
import VerifyPage from "./pages/verify";
import CalendarPage from "./pages/calendar";
import QueuePage from "./pages/queue";
import EmbedPage from "./pages/embed";
import TransparencyPage from "./pages/transparency";
import { AgentFeedback } from "@runablehq/website-runtime";

function NotFound() {
  return (
    <div className="gutter mx-auto max-w-[1600px] py-28 text-center">
      <h1 className="display text-[40px] text-ink">Nothing on record here.</h1>
      <p className="mt-3 text-[14.5px] text-grey-green">The page or record you asked for does not exist.</p>
      <Button asChild className="mt-6">
        <Link to="/record">Open Record Book</Link>
      </Button>
    </div>
  );
}

function Routes() {
  const [location] = useLocation();
  // Page transitions: one calm fade-and-rise per route change, nothing else.
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={location.split("?")[0]} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
        <Switch location={location}>
          <Route path="/" component={HomePage} />
          <Route path="/record" component={RecordBookPage} />
          <Route path="/record/:symbol" component={RecordDetailPage} />
          <Route path="/markets" component={MarketsPage} />
          <Route path="/intents" component={IntentsPage} />
          <Route path="/intents/:id" component={IntentPage} />
          <Route path="/receipts/:id" component={ReceiptPage} />
          <Route path="/portfolio" component={PortfolioPage} />
          <Route path="/statements/:id" component={StatementPage} />
          <Route path="/redeem" component={RedeemPage} />
          <Route path="/developers" component={ApiPage} />
          <Route path="/how-it-works" component={HowItWorksPage} />
          <Route path="/transparency" component={TransparencyPage} />
          <Route path="/status" component={StatusPage} />
          <Route path="/leaderboard" component={LeaderboardPage} />
          <Route path="/desk/:symbol" component={DeskPage} />
          <Route path="/token" component={TokenPage} />
          <Route path="/reports" component={ReportsPage} />
          <Route path="/reports/:ballotId" component={ReportPage} />
          <Route path="/genesis" component={GenesisPage} />
          <Route path="/verify" component={VerifyPage} />
          <Route path="/calendar" component={CalendarPage} />
          <Route path="/queue" component={QueuePage} />
          <Route path="/queue/:symbol" component={QueuePage} />
          <Route component={NotFound} />
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  const [location] = useLocation();
  // Embeds render bare: no header, footer, guide or notice, so they sit cleanly in an iframe.
  if (location.startsWith("/embed/")) {
    return (
      <Provider>
        <Switch location={location}>
          <Route path="/embed/:symbol" component={EmbedPage} />
        </Switch>
      </Provider>
    );
  }
  return (
    <Provider>
      <Layout>
        <Routes />
      </Layout>
      {import.meta.env.DEV && <AgentFeedback />}
    </Provider>
  );
}
