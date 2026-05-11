"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { AvailabilitySlot, Band, EventItem, MeetingMinute, Member, MoneyItem, SchedulePoll, supabase, TaskItem } from "@/lib/supabase";

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

const weekLabels = ["日", "月", "火", "水", "木", "金", "土"];

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
  const [polls, setPolls] = useState<SchedulePoll[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [calendarDate, setCalendarDate] = useState(() => new Date());
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
    const [memberResult, eventResult, taskResult, moneyResult, minutesResult, pollResult, availabilityResult] = await Promise.all([
      supabase.from("stm_members").select("*").eq("band_id", bandId).order("created_at"),
      supabase.from("stm_events").select("*").eq("band_id", bandId).order("starts_at"),
      supabase.from("stm_tasks").select("*").eq("band_id", bandId).order("created_at", { ascending: false }),
      supabase.from("stm_transactions").select("*").eq("band_id", bandId).order("occurred_on", { ascending: false }),
      supabase.from("stm_meeting_minutes").select("*").eq("band_id", bandId).order("created_at", { ascending: false }),
      supabase.from("stm_schedule_polls").select("*").eq("band_id", bandId).eq("status", "open").order("created_at", { ascending: false }),
      supabase.from("stm_availability_slots").select("*").eq("band_id", bandId).order("starts_at", { ascending: true })
    ]);

    setMembers((memberResult.data ?? []) as Member[]);
    setEvents((eventResult.data ?? []) as EventItem[]);
    setTasks((taskResult.data ?? []) as TaskItem[]);
    setMoney((moneyResult.data ?? []) as MoneyItem[]);
    setMinutes((minutesResult.data ?? []) as MeetingMinute[]);
    setPolls((pollResult.data ?? []) as SchedulePoll[]);
    setAvailability((availabilityResult.data ?? []) as AvailabilitySlot[]);

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
      location: String(formData.get("location") ?? ""),
      allow_muted_participation: formData.get("allowMuted") === "on"
    });
    await loadBandData(band.id, session!.user.id);
  }

  async function addSchedulePoll(formData: FormData) {
    if (!band) return;
    await supabase.from("stm_schedule_polls").insert({
      band_id: band.id,
      title: String(formData.get("title")),
      kind: String(formData.get("kind")),
      note: String(formData.get("note") || ""),
      allow_muted_participation: formData.get("allowMuted") === "on"
    });
    await loadBandData(band.id, session!.user.id);
  }

  async function addAvailability(formData: FormData) {
    if (!band || !myMember) {
      setMessage("先に自分のメンバー情報を登録してください。");
      return;
    }

    await supabase.from("stm_availability_slots").insert({
      band_id: band.id,
      poll_id: String(formData.get("pollId")),
      member_id: myMember.id,
      starts_at: new Date(String(formData.get("startsAt"))).toISOString(),
      ends_at: new Date(String(formData.get("endsAt"))).toISOString(),
      can_join_muted: formData.get("canJoinMuted") === "on",
      note: String(formData.get("note") || "")
    });
    await loadBandData(band.id, session!.user.id);
  }

  async function scheduleCandidate(formData: FormData) {
    if (!band) return;
    await supabase.from("stm_events").insert({
      band_id: band.id,
      title: String(formData.get("title")),
      kind: String(formData.get("kind")),
      starts_at: String(formData.get("startsAt")),
      ends_at: String(formData.get("endsAt")),
      location: String(formData.get("location") || "調整済み"),
      notes: String(formData.get("notes") || ""),
      allow_muted_participation: formData.get("allowMuted") === "true"
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

  async function deleteRecord(table: string, id: string) {
    if (!band || !window.confirm("この入力を削除しますか？")) return;
    await supabase.from(table).delete().eq("id", id);
    await loadBandData(band.id, session!.user.id);
  }

  async function editEvent(event: EventItem) {
    if (!band) return;
    const title = window.prompt("予定名", event.title);
    if (title === null) return;
    const startsAt = window.prompt("開始日時", toDateTimeLocal(event.starts_at));
    if (startsAt === null) return;
    const location = window.prompt("場所", event.location ?? "");
    if (location === null) return;
    const allowMuted = window.confirm("オンライン会議はミュート参加可にしますか？");
    await supabase.from("stm_events").update({
      title,
      starts_at: new Date(startsAt).toISOString(),
      location,
      allow_muted_participation: allowMuted
    }).eq("id", event.id);
    await loadBandData(band.id, session!.user.id);
  }

  async function editSchedulePoll(poll: SchedulePoll) {
    if (!band) return;
    const title = window.prompt("調整名", poll.title);
    if (title === null) return;
    const note = window.prompt("補足", poll.note ?? "");
    if (note === null) return;
    const allowMuted = window.confirm("オンライン会議はミュート参加可にしますか？");
    await supabase.from("stm_schedule_polls").update({ title, note, allow_muted_participation: allowMuted }).eq("id", poll.id);
    await loadBandData(band.id, session!.user.id);
  }

  async function editAvailability(slot: AvailabilitySlot) {
    if (!band) return;
    const startsAt = window.prompt("開始日時", toDateTimeLocal(slot.starts_at));
    if (startsAt === null) return;
    const endsAt = window.prompt("終了日時", toDateTimeLocal(slot.ends_at));
    if (endsAt === null) return;
    const note = window.prompt("メモ", slot.note ?? "");
    if (note === null) return;
    const canJoinMuted = window.confirm("この時間はミュート参加なら可にしますか？");
    await supabase.from("stm_availability_slots").update({
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      note,
      can_join_muted: canJoinMuted
    }).eq("id", slot.id);
    await loadBandData(band.id, session!.user.id);
  }

  async function editTask(task: TaskItem) {
    if (!band) return;
    const title = window.prompt("やる事", task.title);
    if (title === null) return;
    const dueDate = window.prompt("期限 yyyy-mm-dd", task.due_date ?? "");
    if (dueDate === null) return;
    await supabase.from("stm_tasks").update({ title, due_date: dueDate || null }).eq("id", task.id);
    await loadBandData(band.id, session!.user.id);
  }

  async function editMoney(item: MoneyItem) {
    if (!band) return;
    const title = window.prompt("内容", item.title);
    if (title === null) return;
    const amount = window.prompt("金額", String(item.amount));
    if (amount === null) return;
    const category = window.prompt("カテゴリ", item.category);
    if (category === null) return;
    const occurredOn = window.prompt("日付 yyyy-mm-dd", item.occurred_on);
    if (occurredOn === null) return;
    await supabase.from("stm_transactions").update({ title, amount: Number(amount || 0), category, occurred_on: occurredOn }).eq("id", item.id);
    await loadBandData(band.id, session!.user.id);
  }

  async function editMinute(minute: MeetingMinute) {
    if (!band) return;
    const title = window.prompt("議事録タイトル", minute.title);
    if (title === null) return;
    const body = window.prompt("話した内容", minute.body);
    if (body === null) return;
    const decisions = window.prompt("決定事項", minute.decisions ?? "");
    if (decisions === null) return;
    const actionItems = window.prompt("担当・宿題", minute.action_items ?? "");
    if (actionItems === null) return;
    const nextSteps = window.prompt("次回まで", minute.next_steps ?? "");
    if (nextSteps === null) return;
    await supabase.from("stm_meeting_minutes").update({
      title,
      body,
      decisions,
      action_items: actionItems,
      next_steps: nextSteps,
      updated_at: new Date().toISOString()
    }).eq("id", minute.id);
    await loadBandData(band.id, session!.user.id);
  }

  async function editMember(member: Member) {
    if (!band) return;
    const displayName = window.prompt("名前", member.display_name);
    if (displayName === null) return;
    const instrument = window.prompt("パート", member.instrument ?? "");
    if (instrument === null) return;
    const email = window.prompt("メール", member.email ?? "");
    if (email === null) return;
    await supabase.from("stm_members").update({ display_name: displayName, instrument, email }).eq("id", member.id);
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
            <TaskList tasks={myTasks.slice(0, 4)} members={members} onToggle={toggleTask} onEdit={editTask} onDelete={(task) => deleteRecord("stm_tasks", task.id)} />
          </>
        )}

        {tab === "schedule" && (
          <>
            <CalendarView
              currentDate={calendarDate}
              events={events}
              polls={polls}
              availability={availability}
              onMonthChange={setCalendarDate}
            />
            <Panel title="日程調整">
              <SchedulePollForm action={addSchedulePoll} />
              <AvailabilityForm action={addAvailability} polls={polls} />
              <SchedulePollList
                polls={polls}
                availability={availability}
                members={members}
                onSchedule={scheduleCandidate}
                onEditPoll={editSchedulePoll}
                onDeletePoll={(poll) => deleteRecord("stm_schedule_polls", poll.id)}
                onEditAvailability={editAvailability}
                onDeleteAvailability={(slot) => deleteRecord("stm_availability_slots", slot.id)}
              />
            </Panel>
            <Panel title="確定予定">
              <EventForm action={addEvent} />
              <Timeline events={events} onEdit={editEvent} onDelete={(event) => deleteRecord("stm_events", event.id)} />
            </Panel>
          </>
        )}

        {tab === "tasks" && (
          <Panel title="やる事リスト">
            <TaskForm action={addTask} members={members} />
            <TaskList tasks={tasks} members={members} onToggle={toggleTask} onEdit={editTask} onDelete={(task) => deleteRecord("stm_tasks", task.id)} />
          </Panel>
        )}

        {tab === "minutes" && (
          <Panel title="議事録保管">
            <MinuteForm action={addMinute} events={events} />
            <MinuteList minutes={minutes} events={events} onEdit={editMinute} onDelete={(minute) => deleteRecord("stm_meeting_minutes", minute.id)} />
          </Panel>
        )}

        {tab === "money" && (
          <Panel title="資金管理">
            <FinanceCard finance={finance} />
            <MoneyForm action={addMoney} />
            <MoneyList items={money} onEdit={editMoney} onDelete={(item) => deleteRecord("stm_transactions", item.id)} />
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
                  <ActionButtons onEdit={() => editMember(member)} onDelete={() => deleteRecord("stm_members", member.id)} />
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

function CalendarView({
  currentDate,
  events,
  polls,
  availability,
  onMonthChange
}: {
  currentDate: Date;
  events: EventItem[];
  polls: SchedulePoll[];
  availability: AvailabilitySlot[];
  onMonthChange: (date: Date) => void;
}) {
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const cells = buildCalendarCells(monthStart);
  const monthLabel = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(monthStart);
  const pollCandidates = polls.flatMap((poll) =>
    buildCandidates(availability.filter((slot) => slot.poll_id === poll.id)).map((candidate) => ({ ...candidate, poll }))
  );
  const nextMeetingCandidate = pollCandidates
    .filter((candidate) => candidate.poll.kind === "meeting")
    .sort((a, b) => b.members.length - a.members.length || new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];

  return (
    <section className="calendarCard">
      <div className="calendarHeader">
        <button onClick={() => onMonthChange(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1))}>前月</button>
        <div>
          <span>カレンダー</span>
          <h2>{monthLabel}</h2>
        </div>
        <button onClick={() => onMonthChange(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))}>次月</button>
      </div>

      <div className="calendarLegend">
        <span className="legend meeting">会議</span>
        <span className="legend rehearsal">練習</span>
        <span className="legend live">ライブ</span>
        <span className="legend candidate">候補</span>
      </div>

      {nextMeetingCandidate && (
        <div className="nextMeetingHint">
          <strong>次の会議候補</strong>
          <p>{formatDateRange(nextMeetingCandidate.startsAt, nextMeetingCandidate.endsAt)} / {nextMeetingCandidate.members.length}人参加可</p>
        </div>
      )}

      <div className="calendarWeek">
        {weekLabels.map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="calendarGrid">
        {cells.map((cell) => {
          const dayEvents = events.filter((event) => isSameLocalDay(event.starts_at, cell.date));
          const dayCandidates = pollCandidates.filter((candidate) => isSameLocalDay(candidate.startsAt, cell.date));
          return (
            <div className={`calendarDay ${cell.inMonth ? "" : "mutedDay"}`} key={cell.key}>
              <span className="dayNumber">{cell.date.getDate()}</span>
              <div className="dayItems">
                {dayEvents.slice(0, 3).map((event) => (
                  <span className={`calendarPill ${event.kind}`} key={event.id}>{kindLabels[event.kind]}</span>
                ))}
                {dayCandidates.slice(0, 2).map((candidate) => (
                  <span className="calendarPill candidate" key={`${candidate.poll.id}_${candidate.key}`}>
                    候補 {candidate.members.length}人
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SchedulePollForm({ action }: { action: (formData: FormData) => void }) {
  return (
    <form action={action} className="quickForm pollForm">
      <input name="title" placeholder="調整名 例: 6月リハ候補" required />
      <select name="kind" defaultValue="rehearsal">
        <option value="rehearsal">練習</option>
        <option value="live">ライブ</option>
        <option value="meeting">会議</option>
        <option value="recording">録音</option>
        <option value="other">その他</option>
      </select>
      <label className="checkLine">
        <input name="allowMuted" type="checkbox" />
        オンライン会議はミュート参加可
      </label>
      <textarea name="note" placeholder="補足 例: 2時間、スタジオ未定、オンライン可" />
      <button>調整を作成</button>
    </form>
  );
}

function AvailabilityForm({ action, polls }: { action: (formData: FormData) => void; polls: SchedulePoll[] }) {
  return (
    <form action={action} className="quickForm availabilityForm">
      <select name="pollId" required defaultValue="">
        <option value="" disabled>調整を選択</option>
        {polls.map((poll) => <option key={poll.id} value={poll.id}>{poll.title}</option>)}
      </select>
      <input name="startsAt" type="datetime-local" required />
      <input name="endsAt" type="datetime-local" required />
      <label className="checkLine">
        <input name="canJoinMuted" type="checkbox" />
        この時間はミュート参加なら可
      </label>
      <input name="note" placeholder="メモ 例: 20時以降なら確実" />
      <button>自分の空き時間を追加</button>
    </form>
  );
}

function SchedulePollList({
  polls,
  availability,
  members,
  onSchedule,
  onEditPoll,
  onDeletePoll,
  onEditAvailability,
  onDeleteAvailability
}: {
  polls: SchedulePoll[];
  availability: AvailabilitySlot[];
  members: Member[];
  onSchedule: (formData: FormData) => void;
  onEditPoll: (poll: SchedulePoll) => void;
  onDeletePoll: (poll: SchedulePoll) => void;
  onEditAvailability: (slot: AvailabilitySlot) => void;
  onDeleteAvailability: (slot: AvailabilitySlot) => void;
}) {
  if (!polls.length) return <p className="emptyText">会議、ライブ、練習の日程調整を作ると、ここに候補が並びます。</p>;

  return (
    <div className="list">
      {polls.map((poll) => {
        const pollSlots = availability.filter((slot) => slot.poll_id === poll.id);
        const candidates = buildCandidates(pollSlots);
        return (
          <article className="pollCard" key={poll.id}>
            <div className="pollHeader">
              <div>
                <span>{kindLabels[poll.kind]}</span>
                <h3>{poll.title}</h3>
              </div>
              <div className="pollControls">
                {poll.allow_muted_participation && <small>ミュート可</small>}
                <ActionButtons onEdit={() => onEditPoll(poll)} onDelete={() => onDeletePoll(poll)} />
              </div>
            </div>
            {poll.note && <p>{poll.note}</p>}
            <div className="candidateList">
              {candidates.length ? candidates.map((candidate) => (
                <div className="candidate" key={candidate.key}>
                  <div>
                    <strong>{formatDateRange(candidate.startsAt, candidate.endsAt)}</strong>
                    <p>{candidate.members.map((memberId) => memberName(members, memberId)).join("、")}</p>
                    {candidate.mutedCount > 0 && <small>ミュート参加可 {candidate.mutedCount}人</small>}
                  </div>
                  <form action={onSchedule}>
                    <input name="title" type="hidden" value={poll.title} />
                    <input name="kind" type="hidden" value={poll.kind} />
                    <input name="startsAt" type="hidden" value={candidate.startsAt} />
                    <input name="endsAt" type="hidden" value={candidate.endsAt} />
                    <input name="allowMuted" type="hidden" value={String(poll.allow_muted_participation)} />
                    <input name="notes" type="hidden" value={`日程調整から作成 / 参加可: ${candidate.members.map((memberId) => memberName(members, memberId)).join("、")}`} />
                    <button>予定化</button>
                  </form>
                </div>
              )) : <p className="emptyText">まだ空き時間が入力されていません。</p>}
            </div>
            {pollSlots.length > 0 && (
              <div className="slotList">
                <strong>入力済みの空き時間</strong>
                {pollSlots.map((slot) => (
                  <div className="slotRow" key={slot.id}>
                    <p>{memberName(members, slot.member_id)} / {formatDateRange(slot.starts_at, slot.ends_at)}{slot.can_join_muted ? " / ミュート可" : ""}</p>
                    <ActionButtons onEdit={() => onEditAvailability(slot)} onDelete={() => onDeleteAvailability(slot)} />
                  </div>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
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
      <label className="checkLine">
        <input name="allowMuted" type="checkbox" />
        オンライン会議はミュート参加可
      </label>
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

function Timeline({ events, onEdit, onDelete }: { events: EventItem[]; onEdit: (event: EventItem) => void; onDelete: (event: EventItem) => void }) {
  return (
    <div className="list">
      {events.map((event) => (
        <article className="row eventRow" key={event.id}>
          <time>{formatShortDate(event.starts_at)}</time>
          <div>
            <strong>{event.title}</strong>
            <p>{kindLabels[event.kind]} / {event.location || "場所未定"}{event.allow_muted_participation ? " / ミュート参加可" : ""}</p>
          </div>
          <ActionButtons onEdit={() => onEdit(event)} onDelete={() => onDelete(event)} />
        </article>
      ))}
    </div>
  );
}

function TaskList({
  tasks,
  members,
  onToggle,
  onEdit,
  onDelete
}: {
  tasks: TaskItem[];
  members: Member[];
  onToggle: (task: TaskItem) => void;
  onEdit: (task: TaskItem) => void;
  onDelete: (task: TaskItem) => void;
}) {
  return (
    <div className="list">
      {tasks.map((task) => {
        const assignee = members.find((member) => member.id === task.assignee_member_id);
        return (
          <article className={`taskRow ${task.status === "done" ? "done" : ""}`} key={task.id}>
            <button className="check" onClick={() => onToggle(task)} aria-label="完了切り替え">{task.status === "done" ? "✓" : ""}</button>
            <span><strong>{task.title}</strong><small>{assignee?.display_name ?? "全員"} / {task.due_date ?? "期限なし"}</small></span>
            <ActionButtons onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} />
          </article>
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

function MoneyList({ items, onEdit, onDelete }: { items: MoneyItem[]; onEdit: (item: MoneyItem) => void; onDelete: (item: MoneyItem) => void }) {
  return (
    <div className="list">
      {items.map((item) => (
        <article className="row moneyRow" key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <p>{item.category} / {item.occurred_on}</p>
          </div>
          <b className={item.kind}>{item.kind === "income" ? "+" : "-"}{yen(item.amount)}</b>
          <ActionButtons onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />
        </article>
      ))}
    </div>
  );
}

function MinuteList({
  minutes,
  events,
  onEdit,
  onDelete
}: {
  minutes: MeetingMinute[];
  events: EventItem[];
  onEdit: (minute: MeetingMinute) => void;
  onDelete: (minute: MeetingMinute) => void;
}) {
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
            <ActionButtons onEdit={() => onEdit(minute)} onDelete={() => onDelete(minute)} />
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

function ActionButtons({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="actions">
      <button type="button" onClick={onEdit}>編集</button>
      <button type="button" className="dangerButton" onClick={onDelete}>削除</button>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDateRange(start: string, end: string) {
  const startText = formatDate(start);
  const endText = new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date(end));
  return `${startText} - ${endText}`;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(new Date(value));
}

function yen(value: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function localDateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameLocalDay(value: string, date: Date) {
  return localDateKey(value) === localDateKey(date);
}

function buildCalendarCells(monthStart: Date) {
  const first = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      key: localDateKey(date),
      inMonth: date.getMonth() === monthStart.getMonth()
    };
  });
}

function memberName(members: Member[], memberId: string) {
  return members.find((member) => member.id === memberId)?.display_name ?? "未登録メンバー";
}

function buildCandidates(slots: AvailabilitySlot[]) {
  const grouped = slots.reduce<Record<string, { startsAt: string; endsAt: string; members: Set<string>; mutedCount: number }>>((acc, slot) => {
    const key = `${slot.starts_at}_${slot.ends_at}`;
    acc[key] ??= { startsAt: slot.starts_at, endsAt: slot.ends_at, members: new Set<string>(), mutedCount: 0 };
    if (!acc[key].members.has(slot.member_id) && slot.can_join_muted) acc[key].mutedCount += 1;
    acc[key].members.add(slot.member_id);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([key, value]) => ({ key, startsAt: value.startsAt, endsAt: value.endsAt, members: Array.from(value.members), mutedCount: value.mutedCount }))
    .sort((a, b) => b.members.length - a.members.length || new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}
