const express = require("express");
const app = express();
app.use(express.json());

const employees = [
  { id: "E001", name: "Alice Johnson", monthlySalary: 1400, wallet: "0xf3D8a5912f381Da9949fc0c8393734F173A96B72" },
  { id: "E002", name: "Bob Smith",     monthlySalary: 1400, wallet: "0x0D2A739900730a1736d07B8cFe47510A1fd212DA" },
  { id: "E003", name: "Carol White",   monthlySalary: 1600, wallet: "0xC2dAab9618DB08B955F07E83a457021B6F5c4155" },
  { id: "E004", name: "David Lee",     monthlySalary: 1400, wallet: "0xEbe39f79c7445a6355c20761e49dc341C4216693" },
];

function randomAttendancePct() {
  return +(60 + Math.random() * 40).toFixed(2);
}

app.get("/api/employees", (req, res) => {
  const data = employees.map((emp) => {
    const attendancePercentage = randomAttendancePct();
    const totalMonthlySalary = +((attendancePercentage / 100) * emp.monthlySalary).toFixed(2);
    return { id: emp.id, name: emp.name, wallet: emp.wallet, attendancePercentage, totalMonthlySalary };
  });
  res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Attendance API running on http://localhost:${PORT}`);
});