# Admin — cổng quản trị

## Cấu hình lần đầu

1. Nếu chưa có `Admin/.env`, sao chép `.env.example` thành `.env`.
2. Lấy URI kết nối chuẩn từ MongoDB Atlas: **Connect → Drivers → tắt SRV Connection String**. Dùng nguyên URI `mongodb://...` Atlas cung cấp; mã hóa ký tự đặc biệt trong username/password. Cùng một URI và database phải được dùng trong cả hai project. Nếu Node.js báo `querySrv ECONNREFUSED`, URI non-SRV tránh truy vấn SRV.
3. Điền `MONGODB_DATABASE`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` và `ADMIN_NAME`.
4. Tạo `SESSION_SECRET` riêng cho Admin:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Cloudinary cấu hình bằng `CLOUDINARY_URL` hoặc điền đủ `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Cloudinary lưu file đề `.xlsx`; câu hỏi, lịch thi, tài khoản và kết quả được lưu MongoDB. Atlas cần cấp quyền đọc/ghi cho user và cho phép IP máy chạy app trong Network Access.

## Chạy

Mở terminal tại thư mục `Admin` trong VS Code:

```powershell
npm install
npm run setup
npm start
```

`npm run setup` tạo các index và tạo/cập nhật tài khoản quản trị theo `.env`. Chạy lần đầu hoặc khi muốn cập nhật thông tin Admin. Mở `http://127.0.0.1:8002`.

## Định dạng Excel

- Đề `.xlsx`: cột A là STT (bỏ qua), B là câu hỏi, C–F là đáp án A–D, G là đáp án đúng (`a`, `b`, `c` hoặc `d`).
- Danh sách học sinh `.xlsx`: cột A là tên đăng nhập/họ tên, B là ngày sinh. Ngày sinh hỗ trợ ngày Excel hoặc `ddmmyyyy`.

Có thể đặt lịch mở/đóng, thời lượng, số câu mỗi học sinh, đảo câu/đáp án và số lượt làm (`0` là không giới hạn). Tiến độ tự cập nhật khi học sinh đang thi.

## Cấu trúc

- `server.js`: nạp `.env`, kết nối MongoDB và khởi động máy chủ.
- `config/`: cấu hình MongoDB và Cloudinary.
- `controllers/viewController.js`: dựng giao diện từ HTML tĩnh.
- `middleware/authMiddleware.js`: bảo vệ trang quản trị.
- `routes/adminRoutes.js`: route và nghiệp vụ quản trị.
- `scripts/setup.js`: khởi tạo index và tài khoản Admin.
- `public/`: HTML/CSS/JavaScript.

Không commit hoặc chia sẻ `.env`; file này nằm trong `.gitignore`.