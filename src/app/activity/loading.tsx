export default function Loading() {
  return (
    <div className="min-h-screen" style={{ background: "#f4f6f9" }}>
      <div className="h-[62px] bg-white border-b border-[#e7ebf0]" />
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        <div className="skel h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          <div className="skel h-[92px] rounded-2xl" />
          <div className="skel h-[92px] rounded-2xl" />
          <div className="skel h-[92px] rounded-2xl" />
          <div className="skel h-[92px] rounded-2xl" />
        </div>
        <div className="skel h-11 w-full rounded-xl" />
        <div className="skel h-[420px] rounded-2xl" />
      </div>
    </div>
  );
}
