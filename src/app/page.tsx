"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { Band, EventItem, MeetingMinute, Member, MoneyItem, supabase, TaskItem } from "@/lib/supabase";

type Tab = "home" | "schedule" | "tasks" | "minutes" | "money" | "members";
type ViewState = "loading" | "auth" | "setup" | "app";

const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "home", label: "ホーム", icon: "⌂" },
  { id: "schedule", label: "予定", icon: "◇" },
  { id: "tasks", label: "タスク", icon: "✓" },
  { id: "minutes", label: "議事録", icon: "□" },
  { id: "money", label: "会計", icon: "¥" },
  { id: "members", label: "メンバー", icon: "◎" }
];

const kindLabels = {
  rehearsal: "リハ",
  live: "ライブ",
  recording: "録音",
  meeting: "会議",
  other: "その他"
};

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<ViewState>("loading");
  const [tab, setTab] = useState<Tab>("home");
  const [band, setBand] = useState<Band | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [money, setMoney] = useState<MoneyItem[]>([]);
  const [minutes, setMinutes] = useState<MeetingMinute[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setView("auth");
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      if (!currentSession) {
        setView("auth");
        setBand(null);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) void loadBand(session.user);
  }, [session]);

  const finance = useMemo(() => {
    const income = money.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
    const expense = money.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
    return { income, expense, balance: income - expense };
  }, [money]);

  const nextEvent = events[0];
  const myMember = members.find((member) => member.user_id === session?.user.id);
  const myTasks = tasks.filter((task) => !task.assignee_member_id || task.assignee_member_id === myMember?.id);

  async function loadBand(user: User) {
    setView("loading");
    const { data: ownedBands, error: bandError } = await supabase
      .from("stm_bands")
      .select("*")
      .order("created_at", { ascending: true });

    if (bandError) {
      setMessage(bandError.message);
      setView("setup");
      return;
    }

    const currentBand = ownedBands?.[0] as Band | undefined;
    if (!currentBand) {
      setView("setup");
      return;
    }

    setBand(currentBand);
    await loadBandData(currentBand.id, user.id);
    setView("app");
  }

  async function loadBandData(bandId: string, userId: string) {
    const [memberResult, eventResult, taskResult, moneyResult, minutesResult] = await Promise.all([
      supabase.from("stm_members").select("*").eq("band_id", bandId).order("created_at"),
      supabase.from("stm_events").select("*").eq("band_id", bandId).order("starts_at"),
      supabase.from("stm_tasks").select("*").eq("band_id", bandId).order("created_at", { ascending: false }),
      supabase.from("stm_transactions").select("*").eq("band_id", bandId).order("occurred_on", { ascending: false }),
      supabase.from("stm_meeting_minutes").select("*").eq("band_id", bandId).order("created_at", { ascending: false })
    ]);

    setMembers((memberResult.data ?? []) as Member[]);
    setEvents((eventResult.data ?? []) as EventItem[]);
    setTasks((taskResult.data ?? []) as TaskItem[]);
    setMoney((moneyResult.data ?? []) as MoneyItem[]);
    setMinutes((minutesResult.data ?? []) as MeetingMinute[]);

    const hasProfile = (memberResult.data ?? []).some((member) => member.user_id === userId);
    if (!hasProfile) setMessage("このバンドのメンバー情報を確認できませんでした。");
  }

  async function signIn(formData: FormData) {
    setMessage("");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
  }

  async function signUp(formData: FormData) {
    setMessage("");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const displayName = String(formData.get("displayName") ?? "");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } }
    });
    setMessage(error ? error.message : "登録メールを確認してください。確認後にログインできます。");
  }

  async function createBand(formData: FormData) {
    if (!session?.user) return;
    setMessage("");
    const displayName = String(formData.get("displayName") ?? "メンバー");
    const instrument = String(formData.get("instrument") ?? "");

    const { data: createdBand, error: bandError } = await supabase
      .from("stm_bands")
      .insert({ name: "震星理論", created_by: session.user.id })
      .select()
      .single();

    if (bandError || !createdBand) {
      setMessage(bandError?.message ?? "バンド作成に失敗しました。");
      return;
    }

    const { error: memberError } = await supabase.from("stm_members").insert({
      band_id: createdBand.id,
      user_id: session.user.id,
      email: session.user.email,
      display_name: displayName,
      instrument,
      role: "admin"
    });

    if (memberError) {
      setMessage(memberError.message);
      return;
    }

    setBand(createdBand as Band);
    await loadBandData(createdBand.id, session.user.id);
    setView("app");
  }

  async function addEvent(formData: FormData) {
    if (!band) return;
    await supabase.from("stm_events").insert({
      band_id: band.id,
      title: String(formData.get("title")),
      kind: String(formData.get("kind")),
      starts_at: new Date(String(formData.get("startsAt"))).toISOString(),
      location: String(formData.get("location") ?? "")
    });
    await loadBandData(band.id, session!.user.id);
  }

  async function addTask(formData: FormData) {
    if (!band) return;
    await supabase.from("stm_tasks").insert({
      band_id: band.id,
      title: String(formData.get("title")),
      assignee_member_id: String(formData.get("assignee") || "") || null,
      due_date: String(formData.get("dueDate") || "") || null,
      status: "todo"
    });
    await loadBandData(band.id, session!.user.id);
  }

  async function toggleTask(task: TaskItem) {
    if (!band) return;
    await supabase.from("stm_tasks").update({ status: task.status === "done" ? "todo" : "done" }).eq("id", task.id);
    await loadBandData(band.id, session!.user.id);
  }

  async function addMoney(formData: FormData) {
    if (!band) return;
    await supabase.from("stm_transactions").insert({
      band_id: band.id,
      kind: String(formData.get("kind")),
      category: String(formData.get("category") || "other"),
      title: String(formData.get("title")),
      amount: Number(formData.get("amount") || 0),
      occurred_on: String(formData.get("date") || new Date().toISOString().slice(0, 10))
    });
    await loadBandData(band.id, session!.user.id);
  }

  async function addMinute(formData: FormData) {
    if (!band) return;
    await supabase.from("stm_meeting_minutes").insert({
      band_id: band.id,
      event_id: String(formData.get("eventId") || "") || null,
      title: String(formData.get("title")),
      body: String(formData.get("body")),
      decisions: String(formData.get("decisions") || ""),
      action_items: String(formData.get("actionItems") || ""),
      next_steps: String(formData.get("nextSteps") || "")
    });
    await loadBandData(band.id, session!.user.id);
  }

  async function addMember(formData: FormData) {
    if (!band) return;
    await supabase.from("stm_members").insert({
      band_id: band.id,
      email: String(formData.get("email") || ""),
      display_name: String(formData.get("displayName")),
      instrument: String(formData.get("instrument") || ""),
      role: "member"
    });
    await loadBandData(band.id, session!.user.id);
  }

  if (view === "loading") return <Shell><Loading /></Shell>;
  if (view === "auth") return <AuthScreen message={message} signIn={signIn} signUp={signUp} />;
  if (view === "setup") return <SetupScreen message={message} createBand={createBand} />;

  return (
    <Shell>
      <header className="topbar">
        <div>
          <p className="small">private band app</p>
          <h1>震星理論マネージャー</h1>
        </div>
        <button className="avatar" onClick={() => supabase.auth.signOut()} aria-label="ログアウト">
          {myMember?.display_name?.slice(0, 1) ?? "震"}
        </button>
      </header>

      {message && <p className="notice">{message}</p>}

      <main className="screen">
        {tab === "home" && (
          <>
            <section className="summaryCard dark">
              <span>次の予定</span>
              <h2>{nextEvent?.title ?? "まだ予定がありません"}</h2>
              <p>{nextEvent ? `${formatDate(nextEvent.starts_at)} / ${nextEvent.location ?? "場所未定"}` : "予定タブからリハやライブを追加できます。"}</p>
            </section>
            <MetricGrid finance={finance} tasks={tasks} events={events} />
            <SectionTitle title="自分のタスク" action={`${myTasks.filter((task) => task.status !== "done").length}件`} />
            <TaskList tasks={myTasks.slice(0, 4)} members={members} onToggle={toggleTask} />
          </>
        )}

        {tab === "schedule" && (
          <Panel title="予定を追加">
            <EventForm action={addEvent} />
            <Timeline events={events} />
          </Panel>
        )}

        {tab === "tasks" && (
          <Panel title="やる事リスト">
            <TaskForm action={addTask} members={members} />
            <TaskList tasks={tasks} members={members} onToggle={toggleTask} />
          </Panel>
        )}

        {tab === "minutes" && (
          <Panel title="議事録保管">
            <MinuteForm action={addMinute} events={events} />
            <MinuteList minutes={minutes} events={events} />
          </Panel>
        )}

        {tab === "money" && (
          <Panel title="資金管理">
            <FinanceCard finance={finance} />
            <MoneyForm action={addMoney} />
            <MoneyList items={money} />
          </Panel>
        )}

        {tab === "members" && (
          <Panel title="メンバー">
            <MemberForm action={addMember} />
            <div className="list">
              {members.map((member) => (
                <article className="row" key={member.id}>
                  <div className="memberMark">{member.display_name.slice(0, 1)}</div>
                  <div>
                    <strong>{member.display_name}</strong>
                    <p>{member.instrument || "パート未設定"} / {member.role}</p>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        )}
      </main>

      <nav className="tabs">
        {tabs.map((item) => (
          <button className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)}>
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="phoneShell">{children}</div>;
}

function Loading() {
  return <div className="center">読み込み中...</div>;
}

function AuthScreen({ message, signIn, signUp }: { message: string; signIn: (formData: FormData) => void; signUp: (formData: FormData) => void }) {
  return (
    <Shell>
      <main className="authScreen">
        <h1>震星理論マネージャー</h1>
        <p>バンドメンバーだけで予定、タスク、資金を共有するスマホ専用アプリ。</p>
        {message && <p className="notice">{message}</p>}
        <form action={signIn} className="formCard">
          <input name="email" type="email" placeholder="メール" required />
          <input name="password" type="password" placeholder="パスワード" required />
          <button className="primary">ログイン</button>
        </form>
        <form action={signUp} className="formCard soft">
          <input name="displayName" placeholder="表示名" required />
          <input name="email" type="email" placeholder="メール" required />
          <input name="password" type="password" placeholder="パスワード" minLength={6} required />
          <button>新規メンバー登録</button>
        </form>
      </main>
    </Shell>
  );
}

function SetupScreen({ message, createBand }: { message: string; createBand: (formData: FormData) => void }) {
  return (
    <Shell>
      <main className="authScreen">
        <h1>初期セットアップ</h1>
        <p>最初のメンバーとして「震星理論」の管理スペースを作成します。</p>
        {message && <p className="notice">{message}</p>}
        <form action={createBand} className="formCard">
          <input name="displayName" placeholder="あなたの名前" required />
          <input name="instrument" placeholder="担当パート" />
          <button className="primary">アプリを開始</button>
        </form>
      </main>
    </Shell>
  );
}

function MetricGrid({ finance, tasks, events }: { finance: { income: number; expense: number; balance: number }; tasks: TaskItem[]; events: EventItem[] }) {
  return (
    <section className="metricGrid">
      <div><span>残高</span><strong>{yen(finance.balance)}</strong></div>
      <div><span>未完了</span><strong>{tasks.filter((task) => task.status !== "done").length}</strong></div>
      <div><span>予定</span><strong>{events.length}</strong></div>
    </section>
  );
}

function SectionTitle({ title, action }: { title: string; action?: string }) {
  return <div className="sectionTitle"><h2>{title}</h2>{action && <span>{action}</span>}</div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><SectionTitle title={title} />{children}</section>;
}

function EventForm({ action }: { action: (formData: FormData) => void }) {
  return (
    <form action={action} className="quickForm">
      <input name="title" placeholder="予定名" required />
      <select name="kind" defaultValue="rehearsal">
        <option value="rehearsal">リハ</option>
        <option value="live">ライブ</option>
        <option value="recording">録音</option>
        <option value="meeting">会議</option>
      </select>
      <input name="startsAt" type="datetime-local" required />
      <input name="location" placeholder="場所" />
      <button>追加</button>
    </form>
  );
}

function TaskForm({ action, members }: { action: (formData: FormData) => void; members: Member[] }) {
  return (
    <form action={action} className="quickForm">
      <input name="title" placeholder="やる事" required />
      <select name="assignee" defaultValue="">
        <option value="">全員</option>
        {members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}
      </select>
      <input name="dueDate" type="date" />
      <button>追加</button>
    </form>
  );
}

function MoneyForm({ action }: { action: (formData: FormData) => void }) {
  return (
    <form action={action} className="quickForm">
      <input name="title" placeholder="内容" required />
      <select name="kind" defaultValue="expense">
        <option value="expense">支出</option>
        <option value="income">収入</option>
      </select>
      <input name="category" placeholder="カテゴリ" />
      <input name="amount" type="number" min="0" placeholder="金額" required />
      <input name="date" type="date" />
      <button>記録</button>
    </form>
  );
}

function MinuteForm({ action, events }: { action: (formData: FormData) => void; events: EventItem[] }) {
  const meetingEvents = events.filter((event) => event.kind === "meeting");

  return (
    <form action={action} className="quickForm minuteForm">
      <input name="title" placeholder="議事録タイトル" required />
      <select name="eventId" defaultValue="">
        <option value="">会議予定に紐づけない</option>
        {meetingEvents.map((event) => (
          <option key={event.id} value={event.id}>
            {formatShortDate(event.starts_at)} {event.title}
          </option>
        ))}
      </select>
      <textarea name="body" placeholder="話した内容" required />
      <textarea name="decisions" placeholder="決定事項" />
      <textarea name="actionItems" placeholder="担当タスク・宿題" />
      <textarea name="nextSteps" placeholder="次回までに確認すること" />
      <button>議事録を保存</button>
    </form>
  );
}

function MemberForm({ action }: { action: (formData: FormData) => void }) {
  return (
    <form action={action} className="quickForm">
      <input name="displayName" placeholder="名前" required />
      <input name="instrument" placeholder="パート" />
      <input name="email" type="email" placeholder="メール" />
      <button>追加</button>
    </form>
  );
}

function Timeline({ events }: { events: EventItem[] }) {
  return (
    <div className="list">
      {events.map((event) => (
        <article className="row eventRow" key={event.id}>
          <time>{formatShortDate(event.starts_at)}</time>
          <div>
            <strong>{event.title}</strong>
            <p>{kindLabels[event.kind]} / {event.location || "場所未定"}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function TaskList({ tasks, members, onToggle }: { tasks: TaskItem[]; members: Member[]; onToggle: (task: TaskItem) => void }) {
  return (
    <div className="list">
      {tasks.map((task) => {
        const assignee = members.find((member) => member.id === task.assignee_member_id);
        return (
          <button className={`taskRow ${task.status === "done" ? "done" : ""}`} key={task.id} onClick={() => onToggle(task)}>
            <span className="check">{task.status === "done" ? "✓" : ""}</span>
            <span><strong>{task.title}</strong><small>{assignee?.display_name ?? "全員"} / {task.due_date ?? "期限なし"}</small></span>
          </button>
        );
      })}
    </div>
  );
}

function FinanceCard({ finance }: { finance: { income: number; expense: number; balance: number } }) {
  return (
    <section className="financeCard">
      <span>バンド資金</span>
      <strong>{yen(finance.balance)}</strong>
      <div><p>収入 {yen(finance.income)}</p><p>支出 {yen(finance.expense)}</p></div>
    </section>
  );
}

function MoneyList({ items }: { items: MoneyItem[] }) {
  return (
    <div className="list">
      {items.map((item) => (
        <article className="row moneyRow" key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <p>{item.category} / {item.occurred_on}</p>
          </div>
          <b className={item.kind}>{item.kind === "income" ? "+" : "-"}{yen(item.amount)}</b>
        </article>
      ))}
    </div>
  );
}

function MinuteList({ minutes, events }: { minutes: MeetingMinute[]; events: EventItem[] }) {
  return (
    <div className="list">
      {minutes.map((minute) => {
        const event = events.find((item) => item.id === minute.event_id);
        return (
          <article className="minuteCard" key={minute.id}>
            <div className="minuteMeta">
              <span>{event ? formatShortDate(event.starts_at) : formatShortDate(minute.created_at)}</span>
              <small>{event?.title ?? "単独メモ"}</small>
            </div>
            <h3>{minute.title}</h3>
            <p>{minute.body}</p>
            {minute.decisions && (
              <div>
                <strong>決定事項</strong>
                <p>{minute.decisions}</p>
              </div>
            )}
            {minute.action_items && (
              <div>
                <strong>担当・宿題</strong>
                <p>{minute.action_items}</p>
              </div>
            )}
            {minute.next_steps && (
              <div>
                <strong>次回まで</strong>
                <p>{minute.next_steps}</p>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(new Date(value));
}

function yen(value: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);
}
