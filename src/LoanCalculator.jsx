import React, { useMemo, useState, useEffect } from "react";
import { v4 as uuid } from "uuid";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer, BarChart, Bar, AreaChart, Area } from "recharts";
import { Plus, Trash2, RefreshCw, Download } from "lucide-react";

/**
 * 다중 대출 상환 시뮬레이터 (고도화)
 * - 정적 배포(순수 프런트, SPA) 100% 가능: Vite/GitHub Pages/Firebase Hosting OK
 * - 원리금균등/고정금리 가정, 조기상환수수료 0 가정
 * - 전략: 아발란치(금리우선) / 스노우볼(잔액우선) + "추가상환 타겟 고정" 옵션
 * - 그래프 인터랙션: 특정 대출 선택 시 잔액/월별(원금·이자) 분해
 * - 월별 표, CSV 내보내기
 */

// --- Utilities ---
const currency = (n) => (isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "-");
const pct = (n) => `${(n * 100).toFixed(2)}%`;

// color helpers (loan-wise consistent colors)
const hueAt = (i) => (i * 57) % 360; // spaced hues
const loanFill = (i) => `hsl(${hueAt(i)}, 70%, 62%)`; // principal (lighter)
const loanInterest = (i) => `hsl(${hueAt(i)}, 70%, 38%)`; // interest (darker)
const loanStroke = (i) => `hsl(${hueAt(i)}, 70%, 30%)`;

// Fixed payment for amortizing loan
function monthlyPayment(principal, apr, months) {
  const r = apr / 12;
  if (months <= 0) return 0;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

// --- Storage helpers with error handling ---
const safeLocalStorage = {
  getItem: (key, fallback) => {
    try {
      const item = localStorage.getItem(key);
      return item !== null ? item : fallback;
    } catch (e) {
      console.warn(`localStorage.getItem failed for key "${key}":`, e);
      return fallback;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`localStorage.setItem failed for key "${key}":`, e);
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`localStorage.removeItem failed for key "${key}":`, e);
    }
  }
};

// --- Main Component ---
export default function LoanPayoffPlanner() {
  const [loans, setLoans] = useState(() => {
    try {
      const saved = safeLocalStorage.getItem("multi-loan-loans");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("Failed to parse saved loans:", e);
    }
    return [
      { id: uuid(), name: "주담대", principal: 120_000_000, apr: 0.035, termMonths: 360, repaymentType: 'amortized', allowPrepay: true },
      { id: uuid(), name: "전세대출", principal: 60_000_000, apr: 0.041, termMonths: 240, repaymentType: 'amortized', allowPrepay: true },
      { id: uuid(), name: "신용", principal: 8_000_000, apr: 0.089, termMonths: 36,  repaymentType: 'amortized', allowPrepay: true },
    ];
  });

  const [strategy, setStrategy] = useState(() => safeLocalStorage.getItem("multi-loan-strategy") || "avalanche");
  const [extraBudget, setExtraBudget] = useState(() => Number(safeLocalStorage.getItem("multi-loan-extra")) || 0);
  const [showTable, setShowTable] = useState(false);
  const [lockTarget, setLockTarget] = useState(() => safeLocalStorage.getItem("multi-loan-lockTarget") === "true");
  const [targetLoanId, setTargetLoanId] = useState(() => safeLocalStorage.getItem("multi-loan-targetLoanId") || "");
  const [focusLoanId, setFocusLoanId] = useState(""); // 그래프에 포커스할 대출

  useEffect(() => { safeLocalStorage.setItem("multi-loan-loans", JSON.stringify(loans)); }, [loans]);
  useEffect(() => safeLocalStorage.setItem("multi-loan-strategy", strategy), [strategy]);
  useEffect(() => safeLocalStorage.setItem("multi-loan-extra", String(extraBudget)), [extraBudget]);
  useEffect(() => safeLocalStorage.setItem("multi-loan-lockTarget", String(lockTarget)), [lockTarget]);
  useEffect(() => safeLocalStorage.setItem("multi-loan-targetLoanId", targetLoanId), [targetLoanId]);

  const baseWithMinPayments = useMemo(() =>
    loans.map((L) => ({
      ...L,
      // 원리금균등은 고정 최소납입, 만기일시상환은 이자-only(변동)라서 여기선 null로 두고 시뮬에서 계산
      minPay: L.repaymentType === 'bullet' ? null : monthlyPayment(L.principal, L.apr, L.termMonths),
      repaymentType: L.repaymentType || 'amortized',
      allowPrepay: L.allowPrepay ?? true,
    })),
  [loans]
);

  // Core simulation (고도화: 대출별 분해 데이터 포함)
  const sim = useMemo(() => simulate(baseWithMinPayments, strategy, extraBudget, lockTarget ? targetLoanId : null), [baseWithMinPayments, strategy, extraBudget, lockTarget, targetLoanId]);

  const totalFirstMonthInterest = sim.months.length ? sim.months[0].totalInterest : 0;
  const focus = focusLoanId && sim.loansMeta.find(l => l.id === focusLoanId);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <style>{_style}</style>
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">다중 대출 상환 시뮬레이터</h1>
            <p className="text-sm text-gray-600">여러 대출을 동시에 계산해 매월 이자 합계와 완제 시점을 예측합니다. (고정금리·원리금균등 가정)</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-white shadow hover:shadow-md border" onClick={resetAll}>
              <RefreshCw className="w-4 h-4"/> 초기화
            </button>
            <button className="btn" onClick={()=>downloadCSV(sim)}>
              <Download className="w-4 h-4"/> CSV 내보내기
            </button>
          </div>
        </header>

        {/* Inputs */}
        <section className="grid lg:grid-cols-3 gap-4">
          <Card>
            <h3 className="font-semibold mb-3">상환 전략</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="radio" name="strategy" value="avalanche" checked={strategy === "avalanche"}
                  onChange={(e) => setStrategy(e.target.value)} />
                <span>아발란치 (금리 높은 대출 먼저 상환)</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="strategy" value="snowball" checked={strategy === "snowball"}
                  onChange={(e) => setStrategy(e.target.value)} />
                <span>스노우볼 (잔액 작은 대출 먼저 상환)</span>
              </label>
            </div>
            <div className="mt-4 space-y-2">
              <div>
                <label className="text-sm text-gray-600">추가 상환 예산 (월)</label>
                <input type="number" className="mt-1 w-full input" value={extraBudget}
                       onChange={(e) => setExtraBudget(Number(e.target.value || 0))} min={0} step={1000} />
                <p className="text-xs text-gray-500 mt-1">최소납입 합계 외에 추가로 넣을 금액.</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="lockTarget" checked={lockTarget} onChange={(e)=>setLockTarget(e.target.checked)} />
                <label htmlFor="lockTarget" className="text-sm">추가상환 타겟 고정</label>
              </div>
              <select className="input w-full" value={targetLoanId} onChange={(e)=>setTargetLoanId(e.target.value)} disabled={!lockTarget}>
                <option value="">(선택)</option>
                {loans.map(L=> <option key={L.id} value={L.id}>{L.name}</option>)}
              </select>
              <p className="text-xs text-gray-500">체크 시 전략과 무관하게 선택한 대출에 추가예산을 우선 투입합니다.</p>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <h3 className="font-semibold mb-3">대출 목록</h3>
            <div className="space-y-3">
              {loans.map((L) => (
                <div key={L.id} className={`grid grid-cols-12 gap-2 items-end bg-white p-3 rounded-2xl border ${focusLoanId===L.id? 'ring-2 ring-indigo-300' : ''}`}>
                  <div className="col-span-3">
                    <Label>이름</Label>
                    <input className="input w-full" value={L.name} onChange={(e)=>updateLoan(L.id,{name:e.target.value})}/>
                  </div>
                  <div className="col-span-2">
                    <Label>상환방식</Label>
                    <select className="input w-full" value={L.repaymentType||'amortized'} onChange={(e)=>updateLoan(L.id,{repaymentType:e.target.value})}>
                      <option value="amortized">원리금균등</option>
                      <option value="bullet">만기일시상환(이자만)</option>
                    </select>
                  </div>
                  <div className="col-span-3">
                    <Label>원금(₩)</Label>
                    <input type="number" className="input w-full" value={L.principal}
                           onChange={(e)=>updateLoan(L.id,{principal:Number(e.target.value||0)})} min={0} step={10000}/>
                  </div>
                  <div className="col-span-2">
                    <Label>연이자율</Label>
                    <div className="flex items-center gap-1">
                      <input type="number" className="input w-full" value={(L.apr*100).toFixed(3)}
                             onChange={(e)=>updateLoan(L.id,{apr:Number(e.target.value)/100})} min={0} step={0.01}/>
                      <span className="text-sm">%</span>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <Label>기간(개월)</Label>
                    <input type="number" className="input w-full" value={L.termMonths}
                           onChange={(e)=>updateLoan(L.id,{termMonths:Number(e.target.value||0)})} min={1} step={1}/>
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    <input id={`prepay-${L.id}`} type="checkbox" checked={L.allowPrepay ?? true} onChange={(e)=>updateLoan(L.id,{allowPrepay:e.target.checked})} />
                    <label htmlFor={`prepay-${L.id}`} className="text-sm">조기상환 허용</label>
                  </div>
                  <div className="col-span-7 text-right text-sm text-gray-600 flex items-center justify-end gap-2">
                    <div className="text-gray-500">최소 월납입:</div>
                    <div className="font-semibold text-base">₩{currency(monthlyPayment(L.principal, L.apr, L.termMonths))}</div>
                  </div>
                  <div className="col-span-2 flex justify-end gap-2">
                    <button className="icon-btn" title={focusLoanId===L.id ? "포커스 해제" : "상세 보기"} onClick={()=> setFocusLoanId(prev => prev===L.id ? "" : L.id)}>
                      🎯
                    </button>
                    <button className="icon-btn" title="삭제" onClick={()=>removeLoan(L.id)}>
                      <Trash2 className="w-5 h-5"/>
                    </button>
                  </div>
                </div>
              ))}
              <button className="btn" onClick={()=>addLoan()}>
                <Plus className="w-4 h-4"/> 대출 추가
              </button>
            </div>
          </Card>
        </section>

        {/* KPIs */}
        <section className="grid md:grid-cols-4 gap-4">
          <KPI label="이번 달 총 이자" value={`₩${currency(totalFirstMonthInterest)}`}/>
          <KPI label="최소 월 납입 합계" value={`₩${currency(sim.minMonthlyTotal)}`}/>
          <KPI label="추가 포함 월 납입" value={`₩${currency(sim.minMonthlyTotal + extraBudget)}`}/>
          <KPI label="완제까지 소요" value={`${sim.months.length}개월 (${Math.floor(sim.months.length/12)}년 ${sim.months.length%12}개월)`}/>
        </section>

        {/* Charts */}
        <section className="grid xl:grid-cols-2 gap-6">
          <Card>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold mb-2">잔액 추이 (대출별 색상)</h3>
              <div className="text-sm text-gray-500">총합 + 대출별</div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={sim.months} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" minTickGap={32}/>
                <YAxis tickFormatter={(v)=>`₩${abbr(v)}`}/>
                <Tooltip formatter={(value, name)=>[`₩${currency(value)}`, name]} />
                <Legend />
                {/* total balance as thin outline */}
                <Area type="monotone" dataKey="totalBalance" name="총 잔액" dot={false} stroke="#111827" fillOpacity={0} strokeWidth={1.5} />
                {/* per-loan balances in colors */}
                {sim.loansMeta.map((L, i) => (
                  <Area key={L.id}
                        type="monotone"
                        dataKey={`byLoanBalance.${L.id}`}
                        name={`잔액 - ${L.name}`}
                        stroke={loanStroke(i)}
                        fill={loanFill(i)}
                        fillOpacity={0.18}
                        strokeWidth={2}
                        dot={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h3 className="font-semibold mb-2">월 납입 분해 (대출별 · 원금/이자)</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={sim.months} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" minTickGap={32}/>
                <YAxis tickFormatter={(v)=>`₩${abbr(v)}`}/>
                <Tooltip formatter={(value, name)=>[`₩${currency(value)}`, name]} />
                <Legend />
                {/* stack all series together so a month's bar sums to total payment */}
                {sim.loansMeta.map((L, i) => (
                  <React.Fragment key={L.id}>
                    <Bar dataKey={`byLoanInterest.${L.id}`} name={`${L.name} · 이자`} stackId="pay" fill={loanInterest(i)} />
                    <Bar dataKey={`byLoanPrincipal.${L.id}`} name={`${L.name} · 원금`} stackId="pay" fill={loanFill(i)} />
                  </React.Fragment>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </section>

        {/* Focused Loan Detail */}
        {focus && (
          <section>
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-lg">📊 {focus.name} 상세 상환 스케줄</h3>
                <button className="text-sm text-gray-500 hover:text-gray-700" onClick={()=>setFocusLoanId("")}>✕ 닫기</button>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white border-b-2">
                    <tr className="text-left">
                      <th className="py-2 pr-4">월</th>
                      <th className="py-2 pr-4 text-right">원금 상환</th>
                      <th className="py-2 pr-4 text-right">이자 납부</th>
                      <th className="py-2 pr-4 text-right">월 납입</th>
                      <th className="py-2 pr-4 text-right">잔액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sim.months.map((m, idx)=> {
                      const principal = m.byLoanPrincipal[focus.id] || 0;
                      const interest = m.byLoanInterest[focus.id] || 0;
                      const balance = m.byLoanBalance[focus.id] || 0;
                      const payment = principal + interest;
                      // 잔액이 0이면서 납입도 0인 경우 건너뛰기 (이미 완제된 후)
                      if (balance === 0 && payment === 0 && idx > 0) return null;
                      return (
                        <tr key={idx} className="border-b hover:bg-indigo-50">
                          <td className="py-2 pr-4">{m.label}</td>
                          <td className="py-2 pr-4 text-right">₩{currency(principal)}</td>
                          <td className="py-2 pr-4 text-right text-red-600">₩{currency(interest)}</td>
                          <td className="py-2 pr-4 text-right font-semibold">₩{currency(payment)}</td>
                          <td className="py-2 pr-4 text-right text-blue-600">₩{currency(balance)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        )}

        {/* Schedule Table */}
        <section>
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">월별 요약 (전체 대출 합계)</h3>
              <button className="btn" onClick={()=>setShowTable((s)=>!s)}>{showTable? "표 숨기기" : "표 보기"}</button>
            </div>
            {showTable && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-2">월</th>
                      <th className="py-2 pr-2 text-right">총 납입</th>
                      <th className="py-2 pr-2 text-right">원금</th>
                      <th className="py-2 pr-2 text-right">이자</th>
                      <th className="py-2 pr-2 text-right">잔액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sim.months.map((m, idx)=> (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="py-2 pr-2">{m.label}</td>
                        <td className="py-2 pr-2 text-right">₩{currency(m.totalPayment)}</td>
                        <td className="py-2 pr-2 text-right">₩{currency(m.totalPrincipal)}</td>
                        <td className="py-2 pr-2 text-right">₩{currency(m.totalInterest)}</td>
                        <td className="py-2 pr-2 text-right">₩{currency(m.totalBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>

        <footer className="text-xs text-gray-500">
          ※ 단순화 가정: 모든 대출은 고정금리, 원리금균등, 조기상환수수료 없음, 최소납입 미납 없음. 실제상품은 수수료·변동금리·중도상환비용 등으로 결과가 달라질 수 있습니다.
        </footer>
      </div>
    </div>
  );

  // --- Handlers ---
  function resetAll(){
    if (!confirm("모든 값을 초기 예시로 되돌릴까요?")) return;
    safeLocalStorage.removeItem("multi-loan-loans");
    safeLocalStorage.removeItem("multi-loan-strategy");
    safeLocalStorage.removeItem("multi-loan-extra");
    safeLocalStorage.removeItem("multi-loan-lockTarget");
    safeLocalStorage.removeItem("multi-loan-targetLoanId");
    location.reload();
  }
  function addLoan(){
    setLoans((arr)=>[
      ...arr,
      { id: uuid(), name: `대출 ${arr.length+1}` , principal: 10_000_000, apr: 0.06, termMonths: 60 },
    ]);
  }
  function removeLoan(id){ setLoans((arr)=> arr.filter((x)=>x.id!==id)); }
  function updateLoan(id, patch){ setLoans((arr)=> arr.map((x)=> x.id===id? { ...x, ...patch }: x)); }
}

// --- Simulation Engine (per-loan breakdown) ---
function simulate(loans, strategy, extraBudget, lockedTargetId){
  // live state with per-loan remaining term & flags
  const live = loans.map(L => ({
    id:L.id, name:L.name, apr:L.apr, bal:L.principal,
    minPay:L.minPay, termLeft:L.termMonths, repaymentType: L.repaymentType || 'amortized', allowPrepay: L.allowPrepay ?? true
  }));

  const months = [];
  const minMonthlyTotal = loans.reduce((s, L)=> s + (L.repaymentType==='bullet' ? (L.principal * (L.apr/12)) : L.minPay), 0);
  const maxIter = 1200; // safety cap
  let month = 1;

  const loansMeta = live.map(l => ({ id:l.id, name:l.name }));

  while (live.some(L=>L.bal>1 && L.termLeft>0) && month <= maxIter){
    const active = live.filter(L=>L.bal>1 && L.termLeft>0);
    // priority by strategy (same as before)
    active.sort((a,b)=>{
      if (strategy === 'avalanche'){
        if (b.apr !== a.apr) return b.apr - a.apr;
        return a.bal - b.bal;
      } else {
        if (a.bal !== b.bal) return a.bal - b.bal;
        return b.apr - a.apr;
      }
    });

    const targetId = lockedTargetId || active[0]?.id;

    let totalInterest = 0; let totalPrincipal = 0;
    const byLoanInterest = {}; const byLoanPrincipal = {};

    // 1) 최소 납입(상품별 로직)
    for (const L of live){
      if (L.bal <= 1 || L.termLeft <= 0){ byLoanInterest[L.id]=0; byLoanPrincipal[L.id]=0; continue; }
      const interest = L.bal * (L.apr/12);
      let principalPart = 0; let payInterest = interest;

      if (L.repaymentType === 'amortized'){
        const pay = Math.min(L.minPay ?? 0, L.bal + interest);
        principalPart = Math.max(0, pay - interest);
      } else { // bullet: 이자만 납부, 만기 달에 원금 일괄
        if (L.termLeft === 1){ // maturity month
          principalPart = L.bal; // 원금 전액
        }
      }

      L.bal = Math.max(0, L.bal - principalPart);
      totalInterest += payInterest; totalPrincipal += principalPart;
      byLoanInterest[L.id] = payInterest; byLoanPrincipal[L.id] = principalPart;
    }

    // 2) 추가 상환 예산 배분(조기상환 허용된 대출에 한해)
    let extra = extraBudget;
    if (extra > 0 && targetId){
      const distribute = (loan) => {
        if (!loan || loan.bal <= 1 || !loan.allowPrepay || loan.termLeft<=0) return 0;
        const use = Math.min(extra, loan.bal);
        loan.bal -= use; totalPrincipal += use;
        byLoanPrincipal[loan.id] = (byLoanPrincipal[loan.id]||0) + use; extra -= use; return use;
      };
      const T = live.find(x=>x.id===targetId);
      distribute(T);
      if (extra > 0){
        for (const L of active){ if (extra<=0) break; if (L.id===targetId) continue; distribute(L); }
      }
    }

    const totalPayment = totalPrincipal + totalInterest;
    const totalBalance = live.reduce((s,L)=> s + Math.max(0,L.bal), 0);

    const byLoanBalance = {}; for (const L of live){ byLoanBalance[L.id] = Math.max(0,L.bal); }

    months.push({
      month,
      label: `${Math.floor((month-1)/12)}y ${((month-1)%12)+1}m`,
      totalInterest, totalPrincipal, totalPayment, totalBalance,
      byLoanInterest, byLoanPrincipal, byLoanBalance,
    });

    // advance term
    for (const L of live){ if (L.termLeft>0) L.termLeft -= 1; }

    if (totalBalance <= 1 || active.length===0) break;
    month += 1;
  }

  const monthsForCharts = months.map(m => ({
    ...m,
    ...flattenPrefixed(m.byLoanBalance, 'byLoanBalance.'),
    ...flattenPrefixed(m.byLoanInterest, 'byLoanInterest.'),
    ...flattenPrefixed(m.byLoanPrincipal, 'byLoanPrincipal.'),
  }));

  return { months: monthsForCharts, minMonthlyTotal, loansMeta };
}

function flattenPrefixed(obj, prefix){
  const out = {};
  for (const k in obj){ out[`${prefix}${k}`] = obj[k]; }
  return out;
}

// --- Small UI atoms ---
function Card({ className = "", children }){
  return (
    <div className={`bg-white rounded-2xl shadow-sm border p-4 ${className}`}>{children}</div>
  );
}
function Label({ children }){ return <div className="text-xs text-gray-600 mb-1">{children}</div>; }
function KPI({ label, value }){
  return (
    <div className="bg-white rounded-2xl shadow-sm border p-4">
      <div className="text-xs text-gray-600">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function abbr(v){
  const n = Math.abs(v);
  if (n >= 1_0000_0000) return `${(v/1_0000_0000).toFixed(1)}억`;
  if (n >= 10_000) return `${(v/10_000).toFixed(1)}만`;
  return Math.round(v).toLocaleString();
}

function downloadCSV(sim){
  // 대출별 상세 정보를 포함한 CSV 생성
  const header = ["월", "기간", "총납입", "총원금", "총이자", "총잔액"];

  // 각 대출별로 원금/이자/잔액 컬럼 추가
  sim.loansMeta.forEach(loan => {
    header.push(`${loan.name}_원금`, `${loan.name}_이자`, `${loan.name}_잔액`);
  });

  const rows = sim.months.map(m => {
    const row = [m.month, m.label, m.totalPayment, m.totalPrincipal, m.totalInterest, m.totalBalance];

    // 각 대출의 상세 정보 추가
    sim.loansMeta.forEach(loan => {
      row.push(
        m.byLoanPrincipal[loan.id] || 0,
        m.byLoanInterest[loan.id] || 0,
        m.byLoanBalance[loan.id] || 0
      );
    });

    return row;
  });

  const csv = [header.join(","), ...rows.map(r=>r.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); // UTF-8 BOM 추가
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'loan_simulation_detail.csv'; a.click();
  URL.revokeObjectURL(url);
}

// --- Styles (Tailwind helpers) ---
const _style = `
.input { @apply bg-white border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200; }
.btn { @apply inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 shadow; }
.icon-btn { @apply p-2 rounded-xl bg-gray-100 hover:bg-gray-200 border; }
`;
