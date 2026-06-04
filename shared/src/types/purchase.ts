export interface Purchase {
  id: string;
  userId: string;
  bookId: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  razorpayOrderId: string;
  createdAt: string;
}
