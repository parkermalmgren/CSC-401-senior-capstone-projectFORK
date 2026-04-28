import pytest


def test_validate_email_accepts_valid_addresses(main_module):
    assert main_module._validate_email("user@example.com")
    assert main_module._validate_email("first.last+tag@school.edu")


@pytest.mark.parametrize(
    "value",
    [
        "",
        "not-an-email",
        "user@",
        "@example.com",
        "user@example",
    ],
)
def test_validate_email_rejects_invalid_addresses(main_module, value):
    assert not main_module._validate_email(value)


def test_validate_phone_accepts_us_formats(main_module):
    assert main_module._validate_phone("2345678901")
    assert main_module._validate_phone("+1 (234) 567-8901")


@pytest.mark.parametrize(
    "value",
    [
        "1234567890",  # area code cannot start with 1
        "2340567890",  # exchange cannot start with 0
        "2341567890",  # exchange cannot start with 1
        "234567890",  # wrong length
    ],
)
def test_validate_phone_rejects_invalid_numbers(main_module, value):
    assert not main_module._validate_phone(value)


def test_notification_preferences_validation_passes(main_module):
    model = main_module.NotificationPreferencesUpdate(channel="email", contact="ok@example.com")
    model.validate_contact()

    model = main_module.NotificationPreferencesUpdate(channel="sms", contact="2345678901")
    model.validate_contact()


@pytest.mark.parametrize(
    "channel,contact,error_message",
    [
        ("email", "bad-email", "valid email address"),
        ("sms", "1111111111", "valid 10-digit US phone number"),
        ("push", "anything", "Channel must be 'email' or 'sms'"),
    ],
)
def test_notification_preferences_validation_errors(main_module, channel, contact, error_message):
    model = main_module.NotificationPreferencesUpdate(channel=channel, contact=contact)
    with pytest.raises(ValueError, match=error_message):
        model.validate_contact()
