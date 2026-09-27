/* Code-native, scalable report illustration. Fictional values only. */
'use strict';
const fs=require('node:fs');
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
for(const dark of [false,true]){
 const c=dark?{bg:'#10141b',card:'#171d27',ink:'#e8edf5',muted:'#aab6c7',line:'#344051',gold:'#efba53',tint:'#262216',good:'#172e29',warn:'#30251d'}:{bg:'#fffdf9',card:'#ffffff',ink:'#263345',muted:'#637084',line:'#e4ded2',gold:'#946116',tint:'#fff5df',good:'#edf7f1',warn:'#fff4e9'};
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1060" viewBox="0 0 1440 1060" role="img" aria-labelledby="title desc"><title id="title">Báo cáo tháng — học sinh minh họa</title><desc id="desc">Dữ liệu giả định, không phải kết quả của học sinh thật. Chuyên cần 100%, đã nộp bài 88%, nộp đúng hạn 75%, đã xem bài 90%.</desc><style>text{font-family:Arial,'Segoe UI',sans-serif;fill:${c.ink}}.muted{fill:${c.muted}}.accent{fill:${c.gold}}</style>`;
 const rect=(x,y,w,h,fill,stroke=c.line,r=16)=>svg+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;
 const text=(x,y,s,size=18,weight=400,cls='',anchor='start')=>svg+=`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" class="${cls}" text-anchor="${anchor}">${escape(s)}</text>`;
 const line=(x,y,x2,y2)=>svg+=`<path d="M${x} ${y}H${x2}" stroke="${c.line}"/>`;
 rect(1,1,1438,1058,c.bg,c.line,24);rect(24,24,1392,184,c.tint,'none',18);
 text(48,62,'VINHMATH · BÁO CÁO HỌC TẬP',23,700,'accent');
 rect(48,99,64,64,c.gold,'none',18);svg+='<text x="80" y="140" text-anchor="middle" style="fill:#fff" font-size="24" font-weight="700">HS</text>';
 text(130,126,'HỌC SINH MINH HỌA',28,700);text(130,157,'Khối 7 · Không hiển thị danh tính',18,400,'muted');
 text(1385,107,'BÁO CÁO THÁNG',17,700,'accent','end');text(1385,137,'01/09/2026 — 30/09/2026',20,600,'','end');text(1385,166,'DỮ LIỆU GIẢ ĐỊNH',15,600,'muted','end');
 const metrics=[['100%','Chuyên cần','8/8 buổi có mặt',1],['88%','Đã nộp bài','7/8 bài bắt buộc',.875],['75%','Nộp đúng hạn','6/8 bài đúng hạn',.75],['90%','Đã xem bài','9/10 bài đã mở',.9],['12,4 h','Tự học trên web','Thời gian minh họa',null],['8,0','Điểm trung bình','4 bài có điểm',.8]];
 metrics.forEach((m,i)=>{let x=48+i*226;rect(x,238,214,182,c.card);text(x+18,267,String(i+1).padStart(2,'0'),14,700,'accent');text(x+18,313,m[0],34,700);text(x+18,345,m[1],18,600);text(x+18,374,m[2],15,400,'muted');if(m[3]!==null){rect(x+18,395,178,4,c.line,'none',2);rect(x+18,395,178*m[3],4,c.gold,'none',2);}});
 rect(48,452,768,514,c.card);text(72,493,'Nhận định dành cho phụ huynh',23,700);
 const notes=[['Ưu điểm',['Duy trì đủ các buổi học trong tháng.','Có thói quen xem bài trước khi luyện tập.'],c.good],['Hạn chế',['Còn một bài tập bắt buộc chưa hoàn thành.','Cần xem lại đầy đủ nhận xét của giáo viên.'],c.warn],['Cần cải thiện',['Hoàn thành bài còn thiếu và sửa lỗi đã được chỉ ra.','Chia thời gian ôn tập thành các buổi ngắn, đều đặn.'],c.tint]];
 notes.forEach((n,i)=>{let y=517+i*140;rect(72,y,720,122,n[2]);rect(89,y+18,32,32,c.card,'none',9);text(105,y+40,i+1,18,700,'accent','middle');text(136,y+39,n[0],20,700);n[1].forEach((s,j)=>text(136,y+69+j*27,'• '+s,18,400,'muted'));});
 rect(840,452,552,514,c.card);text(864,493,'Chi tiết trong kỳ',23,700);
 const groups=[['Chuyên cần',[['Có mặt','8/8 buổi'],['Vắng','0 buổi'],['Đi muộn','0 buổi']]],['Bài tập bắt buộc',[['Đã nộp','7/8 bài'],['Đúng hạn','6/8 bài'],['Đã xem lại bài chấm','5/6 bài']]],['Bài tập thưởng thêm',[['Đã nộp','2/3 bài'],['Đúng hạn','2/3 bài'],['Đã xem lại bài chấm','2/2 bài']]]];
 groups.forEach((g,i)=>{let y=518+i*140;rect(864,y,504,126,c.bg);text(882,y+28,g[0],18,700,'accent');g[1].forEach((a,j)=>{text(882,y+55+j*26,a[0],17,400,'muted');text(1348,y+55+j*26,a[1],17,600,'','end');});});
 line(48,998,1392,998);text(48,1030,'Minh họa giao diện · Dữ liệu giả định, không phải báo cáo của học sinh thật.',16,400,'muted');text(1392,1030,'VinhMath',16,600,'accent','end');
 svg+='</svg>';fs.writeFileSync(`assets/home-showcase/monthly-report-${dark?'dark':'light'}.svg`,svg);
}
