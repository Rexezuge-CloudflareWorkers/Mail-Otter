export default function Unauthorized() {
  return (
    <div className="min-h-screen bg-[#101319] text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">Unauthorized</h1>
        <p className="text-[#aab4c2]">You do not have access to this application.</p>
      </div>
    </div>
  );
}
