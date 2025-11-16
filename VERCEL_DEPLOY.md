# Hướng dẫn Deploy lên Vercel

## ⚠️ Quan trọng: Environment Variables

Vercel **KHÔNG** tự động đọc file `.env.local`. Bạn cần cấu hình Environment Variables trong Vercel Dashboard.

## Các bước deploy:

### 1. Push code lên GitHub

```bash
git push origin main
```

### 2. Import project vào Vercel

1. Truy cập [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." → "Project"
3. Import repository từ GitHub
4. Chọn repository của bạn

### 3. Cấu hình Environment Variables

Trong màn hình "Configure Project", scroll xuống phần **"Environment Variables"** và thêm các biến sau:

#### Required Variables:

```
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYourDeployedContract
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_wallet_connect_project_id
```

⚠️ **Lưu ý**: Tên biến phải chính xác là `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` (không phải `NEXT_PUBLIC_WALLET_CONNECT_PF` hay tên khác)

#### Cách thêm:

1. Click "Add" trong phần Environment Variables
2. Nhập tên biến (ví dụ: `NEXT_PUBLIC_CONTRACT_ADDRESS`)
3. Nhập giá trị
4. Chọn môi trường:
   - ✅ **Production** (bắt buộc)
   - ✅ **Preview** (khuyến nghị)
   - ✅ **Development** (tùy chọn)
5. Click "Save"

### 4. Deploy

1. Click "Deploy"
2. Vercel sẽ tự động build và deploy
3. Sau khi deploy xong, bạn sẽ có URL production

### 5. Kiểm tra sau khi deploy

Sau khi deploy, kiểm tra:
- ✅ Website load được không
- ✅ Contract address có đúng không (check console)
- ✅ Wallet Connect có hoạt động không

## Lưu ý:

- **Tất cả biến môi trường phải có prefix `NEXT_PUBLIC_`** để frontend có thể truy cập
- Sau khi thêm/sửa environment variables, cần **redeploy** để áp dụng thay đổi
- Có thể redeploy bằng cách:
  - Vào project → Settings → Environment Variables → Save
  - Hoặc push một commit mới

## Troubleshooting

### Biến môi trường không được nhận?

1. Kiểm tra tên biến có đúng prefix `NEXT_PUBLIC_` không
2. Kiểm tra đã chọn đúng môi trường (Production/Preview) chưa
3. Redeploy lại project
4. Check Vercel build logs để xem có lỗi gì không

### Build failed?

- Check build logs trong Vercel dashboard
- Đảm bảo tất cả dependencies đã được install
- Kiểm tra TypeScript errors (nếu có)

