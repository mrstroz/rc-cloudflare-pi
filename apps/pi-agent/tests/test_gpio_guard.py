from gpiozero import Device, PWMOutputDevice
from gpiozero.pins.mock import MockFactory, MockPWMPin


def test_devices_get_mock_pins(mock_gpio: MockFactory) -> None:
    assert Device.pin_factory is mock_gpio
    with PWMOutputDevice(12, frequency=100) as ena:
        assert isinstance(ena.pin, MockPWMPin)
        ena.value = 0.5
        assert ena.pin.state == 0.5
