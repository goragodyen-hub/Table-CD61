# Study Table - ตารางเรียน & แดชบอร์ดวางแผนการเรียนอัจฉริยะ 📚✨

แดชบอร์ดจัดการชีวิตการเรียนระดับพรีเมียมในรูปแบบ Single-page Web Application ที่โดดเด่นด้วยดีไซน์กระจกฝ้า (Glassmorphism) สวยงามทันสมัย รองรับธีมมืดและธีมสว่างอย่างลงตัว พร้อมแก้ปัญหาความสับสนด้วย **"ระบบตารางเรียนสลับรายสัปดาห์ A/B"** ที่ทำงานร่วมกับ LocalStorage เพื่อช่วยบริหารชีวิตการเรียนของคุณได้อย่างเต็มประสิทธิภาพ

---

## 🌟 ฟีเจอร์หลัก (Key Features)

1. **ระบบตารางเรียนสลับรายสัปดาห์ A/B (Alternating Weekly Timetables)**
   - แยกระบบบันทึกและจัดการรายวิชาระหว่าง **ตารางสัปดาห์ A** และ **ตารางสัปดาห์ B** อย่างเป็นอิสระ
   - แถบเมนูสำหรับการแสดงผลและระบุสถานะ "สัปดาห์ปัจจุบัน" (สัปดาห์นี้เป็น **ตาราง B** เป็นค่าเริ่มต้น)
   - สลับตรวจสอบหรือกรอกข้อมูลอีกตารางล่วงหน้าได้อย่างง่ายดาย

2. **แดชบอร์ดสรุปผลแบบเรียลไทม์ (Premium Dashboard View)**
   - คำทักทายปรับเปลี่ยนตามช่วงเวลาของวัน (Good Morning / Afternoon / Evening)
   - วิดเจ็ตสรุปชั่วโมงเรียนหลักของวันนี้, กิจกรรมการบ้านที่รออยู่ และสถิติความคืบหน้าสะสม

3. **ระบบจัดการวางแผนการเรียนและการบ้าน (Interactive To-Do List)**
   - เช็คลิสต์ระบุงานสะสม จัดหมวดหมู่ตามรายวิชา
   - ระบบขีดฆ่างานที่ทำเสร็จแล้วพร้อมเอฟเฟกต์แอนิเมชันที่สวยงาม บันทึกข้อมูลแบบออฟไลน์ด้วย LocalStorage

4. **เครื่องมือสร้างสมาธิ Pomodoro Study Timer**
   - ตัวนับเวลานับถอยหลังในวงกลม SVG เรืองแสงที่ลื่นไหล
   - โหมดตั้งค่าล่วงหน้าสำหรับการเรียน (25 นาที), พักสายตา (5 นาที), พักผ่อนเต็มพิกัด (15 นาที)
   - ฟังก์ชันเสียงสังเคราะห์ธรรมชาติและบรรยากาศ (Lo-Fi beats, เสียงฝนตก, เสียงป่าไม้) โดยใช้ Web Audio API

5. **ความสวยงามพรีเมียมและการตอบสนอง (Premium Responsive Design)**
   - เอฟเฟกต์ Glassmorphism ด้วย `backdrop-filter: blur(12px)`
   - สลับธีมมืด (Dark Slate Theme) และธีมสว่าง (Warm Light Theme) ได้ด้วยคลิกเดียว
   - ปรับการจัดวาง Layout ตามขนาดอุปกรณ์ทุกสัดส่วนได้อย่างราบรื่น

---

## 🚀 วิธีเปิดใช้งานโปรเจกต์ (Getting Started)

เนื่องจากโครงสร้างทั้งหมดพัฒนาขึ้นด้วย HTML5, CSS3 และ Vanilla Javascript แท้ๆ คุณไม่จำเป็นต้องติดตั้ง Node.js หรือ Compiler ใดๆ:

1. ดับเบิ้ลคลิกไฟล์ [index.html](file:///D:/My%20project/Study%20Table/index.html) ในคอมพิวเตอร์ของคุณเพื่อเปิดในเว็บเบราว์เซอร์ได้ทันที
2. หรือ รันผ่าน Live Server / Development Server ใน IDE ที่คุณเปิด
3. เพื่อผลลัพธ์ที่ดียิ่งขึ้น แนะนำให้สลับเป็นมุมมอง Fullscreen หรือใช้งานบนบราว์เซอร์สมัยใหม่ เช่น Chrome, Edge, Safari หรือ Firefox

---

## 🔗 การเชื่อมต่อ Supabase เพื่อซิงก์ข้อมูลผู้ใช้ข้ามอุปกรณ์ (Supabase Integration)

ในเวอร์ชันนี้แอปพลิเคชันรองรับการเชื่อมโยงฐานข้อมูลคลาวด์ผ่าน **Supabase** ช่วยให้สามารถล็อกอินด้วย Access Code แล้วซิงก์ข้อมูลรายชื่อนักเรียน ตารางเรียน และงาน/การบ้าน (Tasks) ข้ามอุปกรณ์ได้ทันที!

### 1. โครงสร้างตารางบน Supabase (Database Schema):

คุณสามารถนำคำสั่ง SQL ด้านล่างนี้ไปรันสร้างตารางใน **SQL Editor** ของ Supabase ได้ทันที:

```sql
-- 1. สร้างตาราง profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    access_code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. สร้างตาราง tasks
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    subject TEXT DEFAULT '',
    priority TEXT DEFAULT 'medium',
    duedate TEXT,
    notes TEXT DEFAULT '',
    completed BOOLEAN DEFAULT false
);

-- 3. สร้างตาราง timetables
CREATE TABLE IF NOT EXISTS public.timetables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    week TEXT NOT NULL,
    name TEXT NOT NULL,
    room TEXT DEFAULT '',
    teacher TEXT DEFAULT '',
    day INTEGER NOT NULL,
    starttime TEXT NOT NULL,
    endtime TEXT NOT NULL,
    color TEXT NOT NULL
);

-- เปิดใช้งานระบบความปลอดภัยข้อมูล
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetables ENABLE ROW LEVEL SECURITY;

-- สร้างนโยบายสิทธิ์การเข้าถึงข้อมูล (สิทธิ์สาธารณะสำหรับแอปพลิเคชัน Client)
CREATE POLICY "Allow anonymous select on profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert on profiles" ON public.profiles FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous select on tasks" ON public.tasks FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert on tasks" ON public.tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update on tasks" ON public.tasks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous delete on tasks" ON public.tasks FOR DELETE USING (true);

CREATE POLICY "Allow anonymous select on timetables" ON public.timetables FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert on timetables" ON public.timetables FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update on timetables" ON public.timetables FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous delete on timetables" ON public.timetables FOR DELETE USING (true);
```

### 2. วิธีการเชื่อมต่อในแอป:

1. เปิดไฟล์ [app.js](file:///d:/My%20project/Study%20Table/app.js)
2. นำค่า **Supabase URL** และ **Anon Key** จากหน้าตั้งค่า Settings > API ของ Supabase มากรอกใส่สองบรรทัดบนสุด:
   ```javascript
   const SUPABASE_URL = "ใส่ Supabase URL ของคุณตรงนี้";
   const SUPABASE_ANON_KEY = "ใส่ Supabase Anon Key ของคุณตรงนี้";
   ```

*💡 **หมายเหตุ:** หากไม่ได้ใส่คีย์เชื่อมต่อ หรือเซิร์ฟเวอร์ออฟไลน์ แอปจะยังรันต่อด้วยระบบ LocalStorage ในเบราว์เซอร์ให้โดยอัตโนมัติอย่างปลอดภัย (Offline-First).*

---

## 📁 โครงสร้างโปรเจกต์ (Project Directory Structure)

```text
D:\My project\Study Table\
├── index.html   # โครงสร้างเนื้อหาและการแบ่งมุมมอง Dashboard
├── style.css    # การตกแต่ง เอฟเฟกต์กระจก ธีม และแอนิเมชัน
├── app.js       # ตรรกะระบบ, การจัดการ LocalStorage, Pomodoro และกราฟ SVG
└── README.md    # ไฟล์คู่มือโปรเจกต์นี้
```

พัฒนาขึ้นเพื่อตอบโจทย์ผู้เรียนทุกคน ขอให้สนุกกับการเรียนรู้และทำงานอย่างมีสมาธิด้วย **Study Table** ครับ! 💻✍️
