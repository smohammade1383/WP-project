from users.permissions import HasAnyRole


class CanViewAggregatedStats(HasAnyRole):
    required_roles = (
        "Administrator",
        "Chief",
        "Captain",
        "Sergeant",
        "Sergent",
        "Detective",
        "Police Officer",
        "Patrol Officer",
        "Cadet",
    )
