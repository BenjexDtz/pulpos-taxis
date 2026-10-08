

export default function TarjetaDato({ icon: Icon, label, value, sub, color = 'blue', pulse = false }) {
  const colors = { blue: 'border-blue-500 text-blue-400', green: 'border-green-500 text-green-400', yellow: 'border-yellow-500 text-yellow-400', purple: 'border-purple-500 text-purple-400' };
  return (
    <div className={`bg-gray-900 border-l-4 ${colors[color]} rounded-xl p-5 relative overflow-hidden`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-gray-500 text-xs font-mono uppercase tracking-widest mb-1">{label}</p>
          <p className="text-3xl font-black text-white">{value}</p>
          {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
        </div>
        <div className={`p-3 rounded-xl bg-gray-800 ${colors[color]}`}><Icon className="w-5 h-5" /></div>
      </div>
      {pulse && <div className="absolute top-3 right-14"><span className="flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" /></span></div>}
    </div>
  );
}
