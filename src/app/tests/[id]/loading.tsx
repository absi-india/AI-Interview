export default function Loading() {
  return (
    <div className="min-h-screen" style={{ background: "#f4f6f9" }}>
      <div className="h-[58px] bg-white border-b border-[#e7ebf0]" />
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="skel h-[170px] rounded-2xl" />
        <div className="skel h-[190px] rounded-2xl" />
        <div className="skel h-[340px] rounded-2xl" />
        <div className="space-y-3">
          <div className="skel h-[58px] rounded-2xl" />
          <div className="skel h-[58px] rounded-2xl" />
          <div className="skel h-[58px] rounded-2xl" />
          <div className="skel h-[58px] rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
