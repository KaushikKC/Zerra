const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("PaymentRouter", function () {
  const USDC_DECIMALS = 6;
  const FEE_BPS = 50; // 0.5%
  const INITIAL_MINT = 1_000_000 * 10 ** USDC_DECIMALS; // 1M USDC

  async function deployFixture() {
    const [owner, feeRecipient, payer, merchant] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy(
      "USD Coin",
      "USDC",
      USDC_DECIMALS
    );
    await usdc.waitForDeployment();

    const PaymentRouter = await ethers.getContractFactory("PaymentRouter");
    const router = await PaymentRouter.deploy(
      await usdc.getAddress(),
      feeRecipient.address,
      FEE_BPS
    );
    await router.waitForDeployment();

    await usdc.mint(payer.address, INITIAL_MINT);

    return {
      router,
      usdc,
      owner,
      feeRecipient,
      payer,
      merchant,
    };
  }

  describe("Deployment", function () {
    it("Should set usdc, feeRecipient, feeBps and owner", async function () {
      const { router, usdc, owner, feeRecipient } = await loadFixture(deployFixture);
      expect(await router.usdc()).to.equal(await usdc.getAddress());
      expect(await router.feeRecipient()).to.equal(feeRecipient.address);
      expect(await router.feeBps()).to.equal(FEE_BPS);
      expect(await router.owner()).to.equal(owner.address);
    });

    it("Should revert if usdc is zero address", async function () {
      const { feeRecipient } = await loadFixture(deployFixture);
      const PaymentRouter = await ethers.getContractFactory("PaymentRouter");
      await expect(
        PaymentRouter.deploy(ethers.ZeroAddress, feeRecipient.address, FEE_BPS)
      ).to.be.revertedWithCustomError(PaymentRouter, "ZeroAddress");
    });

    it("Should revert if feeRecipient is zero address", async function () {
      const { usdc } = await loadFixture(deployFixture);
      const PaymentRouter = await ethers.getContractFactory("PaymentRouter");
      await expect(
        PaymentRouter.deploy(await usdc.getAddress(), ethers.ZeroAddress, FEE_BPS)
      ).to.be.revertedWithCustomError(PaymentRouter, "ZeroAddress");
    });

    it("Should revert if feeBps > 1000", async function () {
      const { usdc, feeRecipient } = await loadFixture(deployFixture);
      const PaymentRouter = await ethers.getContractFactory("PaymentRouter");
      await expect(
        PaymentRouter.deploy(
          await usdc.getAddress(),
          feeRecipient.address,
          1001
        )
      ).to.be.revertedWithCustomError(PaymentRouter, "FeeTooHigh");
    });
  });

  describe("pay", function () {
    it("Should revert if recipient is zero address", async function () {
      const { router, usdc, payer } = await loadFixture(deployFixture);
      const amount = 1000 * 10 ** USDC_DECIMALS;
      await usdc.connect(payer).approve(await router.getAddress(), amount);
      await expect(
        router.connect(payer).pay(ethers.ZeroAddress, amount, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(router, "ZeroAddress");
    });

    it("Should revert if grossAmount is zero", async function () {
      const { router, merchant } = await loadFixture(deployFixture);
      await expect(
        router.pay(merchant.address, 0, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(router, "ZeroAmount");
    });

    it("Should transfer net amount to merchant and fee to feeRecipient", async function () {
      const { router, usdc, payer, merchant, feeRecipient } = await loadFixture(deployFixture);
      const grossAmount = 1000 * 10 ** USDC_DECIMALS; // 1000 USDC
      const expectedFee = (grossAmount * FEE_BPS) / 10_000; // 5 USDC
      const expectedNet = grossAmount - expectedFee;

      await usdc.connect(payer).approve(await router.getAddress(), grossAmount);

      const merchantBefore = await usdc.balanceOf(merchant.address);
      const feeRecipientBefore = await usdc.balanceOf(feeRecipient.address);

      await router.connect(payer).pay(merchant.address, grossAmount, ethers.ZeroHash);

      expect(await usdc.balanceOf(merchant.address)).to.equal(merchantBefore + BigInt(expectedNet));
      expect(await usdc.balanceOf(feeRecipient.address)).to.equal(feeRecipientBefore + BigInt(expectedFee));
    });

    it("Should emit PaymentExecuted with correct args", async function () {
      const { router, usdc, payer, merchant } = await loadFixture(deployFixture);
      const grossAmount = 100 * 10 ** USDC_DECIMALS;
      const paymentRef = ethers.keccak256(ethers.toUtf8Bytes("invoice-123"));
      const expectedFee = (grossAmount * FEE_BPS) / 10_000;
      const expectedNet = grossAmount - expectedFee;

      await usdc.connect(payer).approve(await router.getAddress(), grossAmount);

      await expect(
        router.connect(payer).pay(merchant.address, grossAmount, paymentRef)
      )
        .to.emit(router, "PaymentExecuted")
        .withArgs(payer.address, merchant.address, expectedNet, expectedFee, paymentRef);
    });

    it("Should not transfer fee when feeBps is 0", async function () {
      const { router, usdc, payer, merchant, feeRecipient, owner } = await loadFixture(deployFixture);
      await router.connect(owner).updateFeeBps(0);

      const grossAmount = 1000 * 10 ** USDC_DECIMALS;
      await usdc.connect(payer).approve(await router.getAddress(), grossAmount);

      const feeRecipientBefore = await usdc.balanceOf(feeRecipient.address);
      await router.connect(payer).pay(merchant.address, grossAmount, ethers.ZeroHash);
      expect(await usdc.balanceOf(feeRecipient.address)).to.equal(feeRecipientBefore);
      expect(await usdc.balanceOf(merchant.address)).to.equal(grossAmount);
    });
  });

  describe("splitPay", function () {
    it("Should distribute net amount proportionally to recipients", async function () {
      const { router, usdc, payer, merchant, feeRecipient } = await loadFixture(deployFixture);
      const [, , , , recipient1, recipient2] = await ethers.getSigners();

      const grossAmount = 1000 * 10 ** USDC_DECIMALS;
      const bps = [9000n, 1000n]; // 90% / 10%
      const expectedFee = (grossAmount * FEE_BPS) / 10_000; // 5 USDC
      const net = grossAmount - expectedFee; // 995 USDC
      const share1 = (net * 9000) / 10_000; // 895.5 → truncated
      const share2 = (net * 1000) / 10_000; // 99.5 → truncated

      await usdc.connect(payer).approve(await router.getAddress(), grossAmount);

      const r1Before = await usdc.balanceOf(recipient1.address);
      const r2Before = await usdc.balanceOf(recipient2.address);

      await router.connect(payer).splitPay(
        [recipient1.address, recipient2.address],
        bps,
        grossAmount,
        ethers.ZeroHash
      );

      expect(await usdc.balanceOf(recipient1.address)).to.equal(r1Before + BigInt(share1));
      expect(await usdc.balanceOf(recipient2.address)).to.equal(r2Before + BigInt(share2));
    });

    it("Should deduct fee and send to feeRecipient", async function () {
      const { router, usdc, payer, feeRecipient } = await loadFixture(deployFixture);
      const [, , , , recipient1, recipient2] = await ethers.getSigners();

      const grossAmount = 1000 * 10 ** USDC_DECIMALS;
      const expectedFee = (grossAmount * FEE_BPS) / 10_000;

      await usdc.connect(payer).approve(await router.getAddress(), grossAmount);
      const feeBefore = await usdc.balanceOf(feeRecipient.address);

      await router.connect(payer).splitPay(
        [recipient1.address, recipient2.address],
        [5000n, 5000n],
        grossAmount,
        ethers.ZeroHash
      );

      expect(await usdc.balanceOf(feeRecipient.address)).to.equal(feeBefore + BigInt(expectedFee));
    });

    it("Should emit SplitPaymentExecuted event", async function () {
      const { router, usdc, payer } = await loadFixture(deployFixture);
      const [, , , , recipient1, recipient2] = await ethers.getSigners();

      const grossAmount = 100 * 10 ** USDC_DECIMALS;
      const bps = [7000n, 3000n];
      const paymentRef = ethers.keccak256(ethers.toUtf8Bytes("split-invoice"));
      const expectedFee = (grossAmount * FEE_BPS) / 10_000;
      const net = grossAmount - expectedFee;
      const share1 = (net * 7000) / 10_000;
      const share2 = (net * 3000) / 10_000;

      await usdc.connect(payer).approve(await router.getAddress(), grossAmount);

      await expect(
        router.connect(payer).splitPay(
          [recipient1.address, recipient2.address],
          bps,
          grossAmount,
          paymentRef
        )
      )
        .to.emit(router, "SplitPaymentExecuted")
        .withArgs(
          payer.address,
          [recipient1.address, recipient2.address],
          [BigInt(share1), BigInt(share2)],
          BigInt(net),
          BigInt(expectedFee),
          paymentRef
        );
    });

    it("Should revert with LengthMismatch if recipients array is empty", async function () {
      const { router, payer } = await loadFixture(deployFixture);
      await expect(
        router.connect(payer).splitPay([], [], 1000, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(router, "LengthMismatch");
    });

    it("Should revert with LengthMismatch if arrays have different lengths", async function () {
      const { router, payer, merchant } = await loadFixture(deployFixture);
      await expect(
        router.connect(payer).splitPay(
          [merchant.address],
          [5000n, 5000n],
          1000,
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(router, "LengthMismatch");
    });

    it("Should revert with BpsMustSum10000 if bps do not sum to 10000", async function () {
      const { router, payer, merchant, feeRecipient } = await loadFixture(deployFixture);
      await expect(
        router.connect(payer).splitPay(
          [merchant.address, feeRecipient.address],
          [5000n, 4000n], // only 9000
          1000,
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(router, "BpsMustSum10000");
    });
  });

  describe("updateFeeBps", function () {
    it("Should update fee and emit FeeUpdated", async function () {
      const { router, owner } = await loadFixture(deployFixture);
      const newBps = 100;
      await expect(router.connect(owner).updateFeeBps(newBps))
        .to.emit(router, "FeeUpdated")
        .withArgs(FEE_BPS, newBps);
      expect(await router.feeBps()).to.equal(newBps);
    });

    it("Should revert if not owner", async function () {
      const { router, payer } = await loadFixture(deployFixture);
      await expect(
        router.connect(payer).updateFeeBps(100)
      ).to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount");
    });

    it("Should revert if new fee > 1000", async function () {
      const { router, owner } = await loadFixture(deployFixture);
      await expect(
        router.connect(owner).updateFeeBps(1001)
      ).to.be.revertedWithCustomError(router, "FeeTooHigh");
    });
  });

  describe("updateFeeRecipient", function () {
    it("Should update feeRecipient and emit FeeRecipientUpdated", async function () {
      const { router, owner, merchant } = await loadFixture(deployFixture);
      const oldRecipient = await router.feeRecipient();
      await expect(router.connect(owner).updateFeeRecipient(merchant.address))
        .to.emit(router, "FeeRecipientUpdated")
        .withArgs(oldRecipient, merchant.address);
      expect(await router.feeRecipient()).to.equal(merchant.address);
    });

    it("Should revert if not owner", async function () {
      const { router, payer, merchant } = await loadFixture(deployFixture);
      await expect(
        router.connect(payer).updateFeeRecipient(merchant.address)
      ).to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount");
    });

    it("Should revert if new recipient is zero address", async function () {
      const { router, owner } = await loadFixture(deployFixture);
      await expect(
        router.connect(owner).updateFeeRecipient(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(router, "ZeroAddress");
    });
  });
});
