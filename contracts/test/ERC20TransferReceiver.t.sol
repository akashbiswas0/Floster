// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20TransferReceiver, IReceiver, IERC165} from "../src/ERC20TransferReceiver.sol";

interface Vm {
  function prank(address msgSender) external;
  function expectRevert(bytes calldata) external;
  function expectRevert(bytes4) external;
}

contract TestBase {
  Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

  function assertEq(uint256 left, uint256 right, string memory message) internal pure {
    require(left == right, message);
  }

  function assertEq(address left, address right, string memory message) internal pure {
    require(left == right, message);
  }

  function assertTrue(bool value, string memory message) internal pure {
    require(value, message);
  }
}

contract MockERC20 {
  mapping(address => uint256) public balanceOf;
  bool public shouldFail;

  constructor(address holder, uint256 amount) {
    balanceOf[holder] = amount;
  }

  function setShouldFail(bool next) external {
    shouldFail = next;
  }

  function transfer(address recipient, uint256 amount) external returns (bool) {
    if (shouldFail) {
      return false;
    }
    require(balanceOf[msg.sender] >= amount, "insufficient balance");
    balanceOf[msg.sender] -= amount;
    balanceOf[recipient] += amount;
    return true;
  }
}

contract ERC20TransferReceiverTest is TestBase {
  address internal constant OWNER = address(0xA11CE);
  address internal constant FORWARDER = address(0xB0B);
  address internal constant RECIPIENT = address(0xC0FFEE);

  ERC20TransferReceiver internal receiver;
  MockERC20 internal token;

  function setUp() public {
    receiver = new ERC20TransferReceiver(OWNER, FORWARDER);
    token = new MockERC20(address(receiver), 1_000_000 ether);
  }

  function testSupportsIReceiverInterface() public view {
    assertTrue(!receiver.supportsInterface(bytes4(0xffffffff)), "unexpected random interface support");
    assertTrue(receiver.supportsInterface(type(IERC165).interfaceId), "missing IERC165 support");
    assertTrue(receiver.supportsInterface(type(IReceiver).interfaceId), "missing IReceiver support");
  }

  function testOnReportExecutesTransfer() public {
    bytes memory report = abi.encodeCall(receiver.transferToken, (address(token), RECIPIENT, 25 ether));

    vm.prank(FORWARDER);
    receiver.onReport(hex"", report);

    assertEq(token.balanceOf(address(receiver)), 1_000_000 ether - 25 ether, "receiver balance mismatch");
    assertEq(token.balanceOf(RECIPIENT), 25 ether, "recipient balance mismatch");
  }

  function testRejectsZeroRecipient() public {
    bytes memory report = abi.encodeCall(receiver.transferToken, (address(token), address(0), 1 ether));

    vm.expectRevert(abi.encodeWithSelector(ERC20TransferReceiver.InvalidRecipient.selector, address(0)));
    vm.prank(FORWARDER);
    receiver.onReport(hex"", report);
  }

  function testRejectsZeroAmount() public {
    bytes memory report = abi.encodeCall(receiver.transferToken, (address(token), RECIPIENT, 0));

    vm.expectRevert(ERC20TransferReceiver.InvalidAmount.selector);
    vm.prank(FORWARDER);
    receiver.onReport(hex"", report);
  }

  function testBubblesFailedTokenTransfer() public {
    token.setShouldFail(true);
    bytes memory report = abi.encodeCall(receiver.transferToken, (address(token), RECIPIENT, 1 ether));

    vm.expectRevert(ERC20TransferReceiver.TokenTransferFailed.selector);
    vm.prank(FORWARDER);
    receiver.onReport(hex"", report);
  }
}
