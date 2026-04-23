import React, { useState, useMemo, useEffect } from 'react';
import './index.css';
import {
  LayoutGrid, PlusCircle, Mail, History, TrendingUp, TrendingDown,
  Wallet, PieChart as PieChartIcon, Calendar, ChevronDown, CheckCircle, AlertCircle, Trash2, Eraser
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, AreaChart, Area
} from 'recharts';
import { auth, signInWithGoogle, logOut, googleProvider } from './firebase';
import { onAuthStateChanged, GoogleAuthProvider } from 'firebase/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [timeRange, setTimeRange] = useState(new Date().getMonth().toString());
  const [syncStatus, setSyncStatus] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState(() => sessionStorage.getItem('googleAccessToken'));

  const [lastSynced, setLastSynced] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchTransactions(currentUser);
      } else {
        setTransactions([]);
        setGoogleAccessToken(null);
        setLastSynced(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Automatic Sync Logic
  useEffect(() => {
    if (user && googleAccessToken) {
      // Small timeout to not spam on login
      const initialSync = setTimeout(() => {
        handleSync();
      }, 3000);

      // Background refresh every 24 hours
      const interval = setInterval(() => {
        handleSync();
      }, 24 * 60 * 60 * 1000);

      return () => {
        clearTimeout(initialSync);
        clearInterval(interval);
      };
    }
  }, [user, googleAccessToken]);

  const handleSignIn = async () => {
    try {
      const result = await signInWithGoogle();
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential.accessToken;
      setGoogleAccessToken(token);
      sessionStorage.setItem('googleAccessToken', token);
    } catch (error) {
      console.error("Sign-in failed:", error);
      setSyncStatus("Login failed. Please try again.");
    }
  };

  const fetchTransactions = async (currentUser) => {
    setIsLoading(true);
    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(`${API_URL}/api/transactions`, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      const data = await response.json();
      if (data.transactions) {
        setTransactions(data.transactions);
      }
    } catch (err) {
      console.error("Fetch failed:", err);
      setSyncStatus('Failed to load transaction history.');
    }
    setIsLoading(false);
  };

  const handleSync = async (isManual = false) => {
    if (!user) {
      setSyncStatus("Please sign in first.");
      return;
    }

    if (!googleAccessToken) {
      setSyncStatus("Google Session Expoired. Please Sign In again.");
      setTimeout(() => setSyncStatus(''), 3000);
      return;
    }

    if (isSyncing) return; // Prevent multiple simultaneous syncs

    setIsSyncing(true);
    setSyncStatus(isManual ? 'Connecting to Gmail...' : 'Auto-syncing Gmail...');

    try {
      // Step 1: Initial connection
      await new Promise(r => setTimeout(r, 800)); // Brief pause for visual feedback
      setSyncStatus('Fetching transactions...');

      const idToken = await user.getIdToken();

      const response = await fetch(`${API_URL}/api/sync-emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ googleToken: googleAccessToken })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sync failed');
      }

      setSyncStatus('Processing and de-duplicating...');
      const data = await response.json();

      if (data.transactions) {
        await fetchTransactions(user);
        setLastSynced(new Date());
        setSyncStatus(`Sync successful! ${data.transactions.length} new items processed.`);
      } else {
        setSyncStatus('Sync complete! No new transactions found.');
      }
    } catch (err) {
      setSyncStatus(`Sync error: Please check your connection.`);
      console.error(err);
    }

    // Keep the status visible for a bit then clear
    setTimeout(() => {
      setSyncStatus('');
      setIsSyncing(false);
    }, 3500);
  };

  const handleDelete = async (id) => {
    if (!user) return;
    const previousTransactions = [...transactions];
    setTransactions(prev => prev.filter(t => t.id !== id));
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`${API_URL}/api/transactions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      if (!response.ok) throw new Error('Failed to delete');
      setSyncStatus('Transaction deleted.');
    } catch (err) {
      setTransactions(previousTransactions);
      setSyncStatus('Delete failed.');
    }
    setTimeout(() => setSyncStatus(''), 3000);
  };

  const handleClearAll = async () => {
    if (!user || !window.confirm("Are you sure you want to delete ALL transactions? This cannot be undone.")) return;

    setIsLoading(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`${API_URL}/api/transactions`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      if (!response.ok) throw new Error('Failed to clear data');

      setTransactions([]);
      setSyncStatus('All transactions cleared successfully.');
    } catch (err) {
      console.error(err);
      setSyncStatus('Failed to clear transactions.');
    }
    setIsLoading(false);
    setTimeout(() => setSyncStatus(''), 3000);
  };

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    return transactions.filter(t => {
      const tDate = new Date(t.date);
      if (timeRange === 'weekly') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return tDate >= weekAgo;
      } else if (timeRange === 'yearly') {
        return tDate.getFullYear() === now.getFullYear();
      } else {
        const monthIndex = parseInt(timeRange);
        if (!isNaN(monthIndex)) {
          return tDate.getMonth() === monthIndex && tDate.getFullYear() === now.getFullYear();
        }
      }
      return true;
    });
  }, [transactions, timeRange]);

  const stats = useMemo(() => {
    const income = filteredTransactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = filteredTransactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    return {
      income: parseFloat(income.toFixed(2)),
      expense: parseFloat(expense.toFixed(2)),
      balance: parseFloat((income - expense).toFixed(2))
    };
  }, [filteredTransactions]);

  const chartData = useMemo(() => {
    const dataMap = {};

    filteredTransactions.forEach(t => {
      let key;
      if (timeRange === 'yearly') {
        key = MONTHS[new Date(t.date).getMonth()].substring(0, 3);
      } else {
        key = new Date(t.date).toLocaleDateString('en-US', { weekday: 'short' });
      }

      if (!dataMap[key]) dataMap[key] = { income: 0, expense: 0 };
      if (t.type === 'income') dataMap[key].income += t.amount;
      else dataMap[key].expense += t.amount;
    });

    let labels;
    if (timeRange === 'yearly') {
      labels = MONTHS.map(m => m.substring(0, 3));
    } else {
      labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    }

    return labels.map(label => {
      const { expense = 0 } = dataMap[label] || {};
      return {
        name: label,
        amount: parseFloat(expense.toFixed(2))
      };
    });
  }, [filteredTransactions, timeRange]);

  const categoryData = useMemo(() => {
    const cats = {};
    filteredTransactions.filter(t => t.type === 'expense').forEach(t => {
      cats[t.category] = (cats[t.category] || 0) + t.amount;
    });
    return Object.entries(cats).map(([name, value]) => ({
      name,
      value: parseFloat(value.toFixed(2))
    })).sort((a, b) => b.value - a.value);
  }, [filteredTransactions]);

  const insights = useMemo(() => {
    if (filteredTransactions.length === 0) return null;
    const topCat = categoryData.length > 0 ? categoryData[0] : { name: 'None', value: 0 };
    const dailyAvg = stats.expense / (timeRange === 'weekly' ? 7 : 30);
    return {
      topCategory: topCat.name,
      topAmount: topCat.value,
      dailyAverage: parseFloat(dailyAvg.toFixed(2))
    };
  }, [filteredTransactions, categoryData, stats, timeRange]);

  const getRangeLabel = () => {
    if (timeRange === 'weekly') return 'This Week';
    if (timeRange === 'yearly') return 'This Year';
    return MONTHS[parseInt(timeRange)];
  };

  return (
    <div className="App">
      <nav className="nav glass-card">
        <div className="logo">Finance Tracker</div>
        <div className="nav-links">
          <button onClick={() => setActiveTab('dashboard')} className={activeTab === 'dashboard' ? 'active' : ''}>
            <LayoutGrid size={18} /> Dashboard
          </button>
          <button onClick={() => setActiveTab('stats')} className={activeTab === 'stats' ? 'active' : ''}>
            <PieChartIcon size={18} /> Stats
          </button>
          <button onClick={() => setActiveTab('add')} className={activeTab === 'add' ? 'active' : ''}>
            <PlusCircle size={18} /> Add
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="period-nav-select"
          >
            <option value="weekly">Weekly</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i.toString()}>{m}</option>
            ))}
            <option value="yearly">Yearly</option>
          </select>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {user.photoURL && <img src={user.photoURL} alt="profile" style={{ width: '32px', borderRadius: '50%' }} />}
              <button onClick={logOut} style={{ background: 'transparent', border: '1px solid var(--glass-border)', padding: '6px 12px', fontSize: '0.85rem' }}>Sign Out</button>
            </div>
          ) : (
            <button className="auth-btn" onClick={handleSignIn}>Sign In</button>
          )}
        </div>
      </nav>

      <main>
        {activeTab === 'dashboard' && (
          <div className="dashboard-grid">
            {syncStatus && (
              <div className="glass-card sync-toast" style={{
                gridColumn: 'span 3',
                background: 'rgba(99, 102, 241, 0.9)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '15px',
                padding: '1.25rem 2rem',
                marginBottom: '1.5rem',
                border: '1px solid rgba(255,255,255,0.2)',
                zIndex: 1000
              }}>
                <Mail size={20} className={isSyncing ? 'animate-pulse' : ''} />
                <span style={{ fontWeight: 600 }}>{syncStatus}</span>
              </div>
            )}

            <div className="glass-card" style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Financial Overview: {getRangeLabel()}</h2>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button
                  onClick={() => handleSync(true)}
                  disabled={isSyncing}
                  className={`sync-btn ${isSyncing ? 'syncing' : ''}`}
                >
                  <Mail size={16} />
                  {isSyncing ? 'Syncing...' : 'Sync Gmail'}
                </button>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                  {filteredTransactions.length} Transactions
                </div>
              </div>
            </div>

            <div className="glass-card stat-card">
              <div className="card-header"><Wallet size={18} /> Total Balance</div>
              <div className="stat-value">₹{stats.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="stat-footer" style={{ color: stats.balance >= 0 ? 'var(--success)' : 'var(--expense)' }}>
                {stats.balance >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {stats.income > 0 ? ((stats.balance / stats.income) * 100).toFixed(1) : 0}% savings rate
              </div>
            </div>

            <div className="glass-card stat-card">
              <div className="card-header"><TrendingUp size={18} style={{ color: 'var(--success)' }} /> Total Income</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>₹{stats.income.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>

            <div className="glass-card">
              <div className="card-header"><TrendingDown size={18} style={{ color: 'var(--expense)' }} /> Total Expenses</div>
              <div className="stat-value" style={{ color: 'var(--expense)' }}>₹{stats.expense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>

            <div className="glass-card" style={{ gridColumn: 'span 3' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Recent Transactions ({getRangeLabel()})</h3>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={handleClearAll}
                    style={{ background: 'transparent', border: '1px solid var(--glass-border)', padding: '6px 12px', fontSize: '0.8rem', color: 'var(--expense)', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Eraser size={14} /> Clear All
                  </button>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>Bank Sync Enabled</div>
                </div>
              </div>
              <div className="transaction-list">
                {isLoading ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>
                ) : (
                  <>
                    {filteredTransactions.map(t => (
                      <div key={t.id} className="transaction-item">
                        <div className="tx-info">
                          <div className="tx-title">{t.description}</div>
                          <div className="tx-meta">{new Date(t.date).toLocaleDateString()} • {t.category}</div>
                        </div>
                        <div className="tx-actions">
                          <div className={`tx-amount ${t.type}`}>
                            {t.type === 'income' ? '+' : '-'}₹{t.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <button className="delete-btn" onClick={() => handleDelete(t.id)} title="Delete"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    ))}
                    {filteredTransactions.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No transactions for {getRangeLabel()}. Click Sync to start tracking.</div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="stats-container">
            <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
              <div className="glass-card stat-card">
                <div className="card-header">🔥 Top Category</div>
                <div className="stat-value" style={{ fontSize: '1.75rem' }}>{insights?.topCategory || 'N/A'}</div>
                <div className="stat-meta">₹{insights?.topAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'} spent</div>
              </div>
              <div className="glass-card stat-card">
                <div className="card-header">📊 Daily Average</div>
                <div className="stat-value" style={{ fontSize: '1.75rem' }}>₹{insights?.dailyAverage.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</div>
                <div className="stat-meta">Based on current filter</div>
              </div>
              <div className="glass-card stat-card">
                <div className="card-header">💡 Insight</div>
                <div className="stat-value" style={{ fontSize: '1.1rem', marginTop: '1rem', fontWeight: 500 }}>
                  {stats.expense > stats.income ? "Your spending exceeds income this period." : "You're doing great on savings!"}
                </div>
              </div>
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))' }}>
              <div className="glass-card">
                <h3>{getRangeLabel()} Expense Trend</h3>
                <div style={{ height: '350px', width: '100%', marginTop: '2rem' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" stroke="var(--text-muted)" />
                      <YAxis stroke="var(--text-muted)" />
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-dark)', border: '1px solid var(--glass-border)', borderRadius: '12px' }}
                        itemStyle={{ color: 'white' }}
                        labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                        formatter={(val) => `₹${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                      />
                      <Area type="monotone" dataKey="amount" stroke="var(--primary)" fillOpacity={1} fill="url(#colorAmt)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-card">
                <h3>Category Breakdown</h3>
                <div style={{ height: '350px', width: '100%', marginTop: '2rem' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                      <XAxis type="number" stroke="var(--text-muted)" hide />
                      <YAxis dataKey="name" type="category" stroke="var(--text-muted)" width={100} />
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-dark)', border: '1px solid var(--glass-border)', borderRadius: '12px' }}
                        itemStyle={{ color: 'white' }}
                        labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                        formatter={(val) => `₹${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--accent)' : 'var(--primary)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'add' && (
          <div className="glass-card add-card">
            <h2>Add Entry</h2>
            <form className="add-form" onSubmit={(e) => e.preventDefault()}>
              <div className="form-group">
                <label>Amount (₹)</label>
                <input type="number" placeholder="0.00" />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select>
                  <option>Shopping</option>
                  <option>Food & Drinks</option>
                  <option>Transport</option>
                  <option>Bills</option>
                  <option>Entertainment</option>
                </select>
              </div>
              <button className="submit-btn" type="submit">Add Transaction</button>
            </form>
          </div>
        )}
      </main>
    </div >
  );
}

export default App;
