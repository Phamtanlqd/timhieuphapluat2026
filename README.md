# Bản đơn giản + an toàn (giữ giao diện của bạn)

## Cập nhật (làm theo đúng thứ tự)
1. **Apps Script**: mở Sheet > Tiện ích mở rộng > Apps Script, **xóa toàn bộ mã cũ**, dán `apps-script/Code.gs` mới, lưu.
2. **Cài đặt dự án > Thuộc tính tập lệnh**: thêm `ADMIN_KEY` = khóa quản trị của bạn.
3. **Triển khai > Quản lý triển khai > (biểu tượng bút) > Phiên bản mới > Triển khai**. URL `/exec` giữ nguyên nên không phải sửa `config.js`.
   Ngay sau bước này, đường dẫn cũ `?action=get_init_data` (đang lộ mật khẩu và đáp án) sẽ ngừng hoạt động.
4. Chép đè các file trong thư mục này lên repo GitHub (`index.html`, `css/`, `js/`, `admin.html`).
5. Vào `admin.html` > nhập khóa > **Cập nhật đề thi** để kiểm tra đề; thi thử 1 tài khoản rồi **Reset 1 học sinh**.

## Sau cuộc thi
`admin.html` > **Khóa cuộc thi & trao giải** (tự ghi XepHang, SaiLech, GiaiThuong vào KET_QUA). Nút "Tổng Kết" ở trang bảng xếp hạng cũng dùng được nhưng phải nhập khóa quản trị.
Ngày in trên giấy chứng nhận sửa ở `js/config.js` (`CERT_DATE`).
Nên cho các lớp vào thi lệch nhau vài phút (Apps Script xử lý khoảng 30 yêu cầu cùng lúc).

## Giải tập thể (lớp)
- 01 giải cho lớp xếp hạng 1 theo thứ tự: **số thí sinh dự thi giảm dần** → trung bình số câu đúng giảm dần → trung bình thời gian tăng dần.
- Khi khóa cuộc thi, kết quả các lớp được ghi vào sheet **KET_QUA_LOP** (tự tạo). Bảng xếp hạng công khai có khung "Lớp dẫn đầu" và nút in bằng khen tập thể.
- Tùy chỉnh ở `CFG` trong `Code.gs`: `GIAI_TAP_THE.tien` (số tiền, 0 = không ghi) và `TAP_THE_XEP_THEO` (`'SO_LUONG'` hoặc `'TY_LE'` = tỷ lệ tham gia trên sĩ số).
- Sau khi dán `Code.gs` mới nhớ **Triển khai > Phiên bản mới**.
