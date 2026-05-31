class BankAccount {
    private int id;
    private double balance;

    public BankAccount(int id, double balance) {
        this.id = id;
        this.balance = balance;
    }

    public int getId() {
        return id;
    }

    public synchronized void withdraw(double amount) {
        balance -= amount;
    }

    public synchronized void deposit(double amount) {
        balance += amount;
    }

    public double getBalance() {
        return balance;
    }
}

class SafeTransferThread extends Thread {
    private BankAccount fromAccount;
    private BankAccount toAccount;
    private double amount;

    public SafeTransferThread(BankAccount fromAccount, BankAccount toAccount, double amount) {
        this.fromAccount = fromAccount;
        this.toAccount = toAccount;
        this.amount = amount;
    }

    @Override
    public void run() {
        // Always lock in a consistent order (by account ID)
        BankAccount firstLock = (fromAccount.getId() < toAccount.getId()) ? fromAccount : toAccount;
        BankAccount secondLock = (fromAccount.getId() < toAccount.getId()) ? toAccount : fromAccount;

        synchronized (firstLock) {
            System.out.println(getName() + " locked " + firstLock.getId());
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {}

            synchronized (secondLock) {
                System.out.println(getName() + " locked " + secondLock.getId());
                fromAccount.withdraw(amount);
                toAccount.deposit(amount);
                System.out.println(getName() + " transferred " + amount +
                                   " from " + fromAccount.getId() + " to " + toAccount.getId());
            }
        }
    }
}

public class DeadlockPreventionExample {
    public static void main(String[] args) {
        BankAccount A = new BankAccount(1, 1000);
        BankAccount B = new BankAccount(2, 1000);

        Thread T1 = new SafeTransferThread(A, B, 100);
        Thread T2 = new SafeTransferThread(B, A, 200);

        T1.start();
        T2.start();
    }
}