export default function Loading() {
  return (
    <div className="min-h-screen p-8" style={{ background: "#f4f6f9" }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="skel h-5 w-40" />
        <div className="skel h-[120px] rounded-2xl" />
        <div className="skel h-[110px] rounded-2xl" />
        <div className="space-y-3">
          <div className="skel h-6 w-32" />
          <div className="skel h-[76px] rounded-2xl" />
          <div className="skel h-[76px] rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
